//! EEG acquisition loop: LSL samples in, processed [`SessionBatch`]es out.
//!
//! [`receive_eeg`] takes a compiled [`ProcessingPlan`] and, on a blocking thread:
//!
//! - loads the Python manager named by `PIPELINE_MANAGER_SCRIPT` (default:
//!   `moss/mock_manager.py`), only if the plan has an ML node,
//! - connects to the first LSL stream of type `EEG`, giving up after
//!   [`SOURCE_TIMEOUT_SECS`], and reads its nominal sample rate,
//! - builds the [`ProcessingChain`] for that rate (cutoffs that don't fit the rate are
//!   reported here),
//! - collects 4-channel samples (fewer channels: dropped; extra channels: ignored), converts
//!   LSL clock time to UTC, and every `chunk_size` samples runs the chain, runs ML on the
//!   ML node's input, and publishes a [`SessionBatch`],
//! - on cancellation, publishes whatever samples are left as a final, shorter batch.
//!
//! Setup failures come back as a [`ClientError`] for the caller to send to the client.

use std::sync::Arc;
use std::time::{Duration, Instant};

use chrono::{DateTime, Utc};
use log::{error, info, warn};
use lsl::{resolve_bypred, Pullable, StreamInlet};
use serde::{Deserialize, Serialize};
use tokio::sync::broadcast::Sender;
use tokio_util::sync::CancellationToken;

use crate::pipeline::ProcessingPlan;
use crate::protocol::{ClientError, ErrorCode};
use crate::signal_processing::chain::{Block, ProcessingChain};
use crate::signal_processing::pipeline_gateway::{MlRequest, PipelineGateway, PipelineOutput};

pub const N_CHANNELS: usize = 4;

pub const SOURCE_TIMEOUT_SECS: u64 = 10;

// muse 2 rate, used if the stream doesn't declare one
const FALLBACK_SAMPLE_RATE: f64 = 256.0;

// what the websocket client receives (see backend/docs/websocket-protocol.md)
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct EEGDataPacket {
    pub timestamps: Vec<DateTime<Utc>>,
    pub signals: Vec<Vec<f64>>,
    pub ml_result: Option<PipelineOutput>,
}

// raw (no overlap) goes to the db, processed goes to the client
#[derive(Debug, Clone)]
pub struct SessionBatch {
    pub raw: EEGDataPacket,
    pub processed: EEGDataPacket,
}

struct MlRunner {
    gateway: PipelineGateway,
    request: MlRequest,
    after_stage: usize,
}

// Runs until cancelled. Errors are sent to the client by the caller.
pub async fn receive_eeg(
    tx: Sender<Arc<SessionBatch>>,
    cancel_token: CancellationToken,
    plan: ProcessingPlan,
) -> Result<(u32, u32), ClientError> {
    info!(
        "Starting EEG data receiver: window={:?}, {} stage(s), ml={}",
        plan.window,
        plan.stages.len(),
        plan.ml.as_ref().map_or("none", |m| m.config.model.as_str())
    );

    let result = tokio::task::spawn_blocking(move || {
        let gateway = match &plan.ml {
            Some(_) => {
                let path = std::env::var("PIPELINE_MANAGER_SCRIPT").unwrap_or_else(|_| {
                    "/app/shared-logic/src/signal_processing/moss/mock_manager.py".to_string()
                });
                let gateway = PipelineGateway::new(&path).map_err(|e| {
                    error!("Failed to initialize pipeline gateway from {}: {}", path, e);
                    ClientError::new(
                        ErrorCode::PipelineInitFailed,
                        "The ML model couldn't be loaded.",
                    )
                })?;
                Some(gateway)
            }
            None => None,
        };

        let Some((inlet, sample_rate)) = setup_eeg_stream(&cancel_token)? else {
            return Ok((0, 0)); // cancelled while waiting for a stream
        };

        let chain = ProcessingChain::new(&plan, sample_rate, N_CHANNELS)?;
        let ml = gateway
            .zip(plan.ml.as_ref())
            .map(|(gateway, tap)| MlRunner {
                gateway,
                request: MlRequest::new(tap, chain.rate_after(tap.after_stage)),
                after_stage: tap.after_stage,
            });

        Ok(run_eeg_collection(
            inlet,
            tx,
            cancel_token,
            plan.window.chunk_size,
            chain,
            ml,
        ))
    });

    match result.await {
        Ok(Ok((count, drop))) => {
            info!(
                "EEG session completed - published: {}, dropped: {}",
                count, drop
            );
            Ok((count, drop))
        }
        Ok(Err(e)) => Err(e),
        Err(e) => {
            error!("EEG receiver task panicked: {}", e);
            Err(ClientError::new(
                ErrorCode::InternalError,
                "The EEG receiver stopped unexpectedly.",
            ))
        }
    }
}

// Returns the inlet and its sample rate, or None if cancelled while waiting.
fn setup_eeg_stream(
    cancel_token: &CancellationToken,
) -> Result<Option<(StreamInlet, f64)>, ClientError> {
    let deadline = Instant::now() + Duration::from_secs(SOURCE_TIMEOUT_SECS);
    let no_source = || {
        ClientError::new(
            ErrorCode::NoSource,
            format!(
                "No EEG stream found within {} seconds. Is the headset streaming?",
                SOURCE_TIMEOUT_SECS
            ),
        )
    };

    // resolve in 1s slices so cancelling doesn't wait out the timeout
    let info = loop {
        if cancel_token.is_cancelled() {
            return Ok(None);
        }
        match resolve_bypred("type='EEG'", 1, 1.0) {
            Ok(mut streams) if !streams.is_empty() => break streams.swap_remove(0),
            Ok(_) => {}
            Err(e) => warn!("Could not resolve EEG stream: {}", e),
        }
        if Instant::now() >= deadline {
            error!("No EEG stream found");
            return Err(no_source());
        }
    };

    let declared = info.nominal_srate();
    let sample_rate = if declared > 0.0 {
        declared
    } else {
        warn!(
            "EEG stream has no regular sample rate; assuming {} Hz",
            FALLBACK_SAMPLE_RATE
        );
        FALLBACK_SAMPLE_RATE
    };

    info!("EEG stream found ({} Hz), creating inlet", sample_rate);
    let inlet = StreamInlet::new(&info, 1000, 0, true).map_err(|e| {
        error!("Could not create StreamInlet: {}", e);
        no_source()
    })?;
    Ok(Some((inlet, sample_rate)))
}

// Main EEG data collection loop.
// Returns (published_count, dropped_count) statistics.
fn run_eeg_collection(
    inlet: StreamInlet,
    tx: Sender<Arc<SessionBatch>>,
    cancel_token: CancellationToken,
    chunk_size: usize,
    mut chain: ProcessingChain,
    ml: Option<MlRunner>,
) -> (u32, u32) {
    let mut count = 0;
    let mut drop = 0;
    let mut pending = Block::empty(N_CHANNELS);

    // Calculate the offset between LSL clock and Unix epoch
    let lsl_to_unix_offset =
        Utc::now().timestamp_nanos_opt().unwrap() as f64 / 1_000_000_000.0 - lsl::local_clock();

    let mut publish = |pending: &mut Block, count: &mut u32, drop: &mut u32| {
        let window = std::mem::replace(pending, Block::empty(N_CHANNELS));
        match process_and_send(window, &mut chain, ml.as_ref(), &tx) {
            Ok(()) => *count += 1,
            Err(e) => {
                error!("Process/send error: {}", e);
                *drop += 1;
            }
        }
    };

    loop {
        if cancel_token.is_cancelled() {
            info!("EEG data receiver cancelled.");
            // Send any remaining samples before exiting
            if !pending.is_empty() {
                publish(&mut pending, &mut count, &mut drop);
            }
            break;
        }

        // Pull sample with timeout of 1 sec. If it does not see data for 1s, it returns.
        match inlet.pull_sample(1.0) {
            Ok((sample, timestamp)) => {
                match accumulate_sample(&sample, timestamp + lsl_to_unix_offset, &mut pending) {
                    Ok(()) if pending.len() >= chunk_size => {
                        publish(&mut pending, &mut count, &mut drop);
                    }
                    Ok(()) => {}
                    Err(e) => {
                        if e.contains("got 0 channels") {
                            info!("Received empty sample from LSL stream (likely during shutdown) - ignoring");
                        } else {
                            drop += 1;
                            error!("Sample processing error (drop #{}): {}", drop, e);
                        }
                    }
                }
            }
            Err(e) => {
                let error_msg = e.to_string();
                // Only log non-timeout errors
                if !error_msg.contains("timeout") {
                    error!("LSL pull_sample error: {}", e);
                    drop += 1;
                }
            }
        }
    }
    (count, drop)
}

// Requires at least 4 channels in sample.
fn accumulate_sample(sample: &[f32], timestamp: f64, pending: &mut Block) -> Result<(), String> {
    if sample.len() < N_CHANNELS {
        return Err(format!(
            "Invalid sample length: got {} channels, expected at least {}",
            sample.len(),
            N_CHANNELS
        ));
    }

    let timestamp_dt = DateTime::from_timestamp(
        timestamp as i64,
        (timestamp.fract() * 1_000_000_000.0) as u32,
    )
    .unwrap_or_else(Utc::now);

    pending.timestamps.push(timestamp_dt);
    for (ch_data, &value) in pending.signals.iter_mut().zip(sample) {
        ch_data.push(value as f64);
    }
    Ok(())
}

// runs one window through the chain and the ML node, then sends it
fn process_and_send(
    window: Block,
    chain: &mut ProcessingChain,
    ml: Option<&MlRunner>,
    tx: &Sender<Arc<SessionBatch>>,
) -> Result<(), String> {
    if window.is_empty() {
        return Err("Empty window".to_string());
    }

    let mut outputs = chain.process(window.clone());

    let ml_result = ml.and_then(|ml| {
        let input = &outputs[ml.after_stage];
        if input.is_empty() {
            return None;
        }
        match ml.gateway.call_pipeline(&ml.request, &input.signals) {
            Ok(Some(output)) => {
                info!(
                    "ML result: task={}, label={}, confidence={:.2}",
                    output.task, output.overall_label, output.confidence
                );
                Some(output)
            }
            Ok(None) => {
                info!("Pipeline ran but returned no classifier output");
                None
            }
            Err(e) => {
                error!("Pipeline gateway error: {}", e);
                None
            }
        }
    });

    let processed = outputs
        .pop()
        .expect("chain returns at least the raw window");
    let batch = SessionBatch {
        raw: EEGDataPacket {
            timestamps: window.timestamps,
            signals: window.signals,
            ml_result: None,
        },
        processed: EEGDataPacket {
            timestamps: processed.timestamps,
            signals: processed.signals,
            ml_result,
        },
    };

    tx.send(Arc::new(batch))
        .map_err(|_| "Send error - no receivers or channel full".to_string())?;
    Ok(())
}
