//! EEG acquisition loop: LSL samples in, windowed [`EEGDataPacket`]s out.
//!
//! [`receive_eeg`] reads the window and preprocessing configs from the [`Pipeline`] (using
//! defaults for missing nodes), loads the Python manager named by `PIPELINE_MANAGER_SCRIPT`
//! (default: `moss/mock_manager.py`), and connects to the first LSL stream of type `EEG`.
//! It blocks until one exists. Then, on a blocking thread:
//!
//! - collects samples shaped by the session's [`ChannelLayout`] (EEG channels first, then
//!   EMG; shorter samples are dropped, extra trailing channels are ignored) and converts LSL
//!   clock time to UTC,
//! - every `chunk_size` samples, prepends the previous batch's last `overlap_size` samples
//!   (with placeholder timestamps), runs [`PipelineGateway::call_pipeline`] on the EEG
//!   channel subset the ML models expect to fill in `ml_result`, and publishes the packet,
//! - on cancellation, publishes whatever samples are left as a final, shorter packet.
//!
//! `eeg`/`emg` in the published packet are always raw. Preprocessing only affects the ML input.
//! [`EEGDataPacket`] is the exact JSON sent to websocket clients (see
//! `backend/docs/websocket-protocol.md`).

use std::sync::Arc;

use chrono::{DateTime, Utc};
use log::{error, info, warn};
use lsl::{resolve_bypred, Pullable, StreamInlet};
use tokio::sync::broadcast::Sender;
use tokio_util::sync::CancellationToken;

use crate::channels::ChannelLayout;
use crate::pipeline::{Pipeline, PreprocessingConfig, WindowConfig};
use crate::signal_processing::pipeline_gateway::{MlChannelSelection, PipelineGateway};

// Re-exported so existing `crate::lsl::EEGDataPacket` imports keep working.
pub use crate::packet::EEGDataPacket;

pub type ProcessingConfig = PreprocessingConfig;
pub type WindowingConfig = WindowConfig;

// Async entry point for EEG data collection.
pub async fn receive_eeg(
    tx: Sender<Arc<EEGDataPacket>>,
    cancel_token: CancellationToken,
    pipeline: Pipeline,
    layout: ChannelLayout,
) {
    info!("Starting EEG data receiver");

    // Extract configs from the pipeline, falling back to defaults if a node is missing
    let preprocessing_config = pipeline.preprocessing_config().cloned().unwrap_or_default();
    let window_config = pipeline.window_config().cloned().unwrap_or_default();
    info!(
        "Received preprocessing config: apply_bandpass={}, l_freq={:?}, h_freq={:?}",
        preprocessing_config.apply_bandpass,
        preprocessing_config.l_freq,
        preprocessing_config.h_freq
    );

    // Create a watch channel from the initial window config.
    // The receiver is passed into the collection loop so it can react to future updates.
    let (_windowing_tx, windowing_rx) = tokio::sync::watch::channel(window_config);

    receive_eeg_with_config(tx, cancel_token, preprocessing_config, windowing_rx, layout).await;
}

// Async entry point for EEG data collection.
pub async fn receive_eeg_with_config(
    tx: Sender<Arc<EEGDataPacket>>,
    cancel_token: CancellationToken,
    processing_config: ProcessingConfig,
    windowing_rx: tokio::sync::watch::Receiver<WindowingConfig>,
    layout: ChannelLayout,
) {
    info!(
        "Starting EEG data receiver ({} EEG + {} EMG channels)",
        layout.eeg(),
        layout.emg()
    );
    // let python_script_path = std::env::var("SIGNAL_PROCESSING_SCRIPT")
    //     .unwrap_or_else(|_| "../shared-logic/src/signal_processing/signalProcessing.py".to_string());

    let manager_script_path = std::env::var("PIPELINE_MANAGER_SCRIPT").unwrap_or_else(|_| {
        "/app/shared-logic/src/signal_processing/moss/mock_manager.py".to_string()
    });

    let result = tokio::task::spawn_blocking(move || {
        // The ML models still expect a fixed EEG subset; validate it against the layout up front.
        let ml_channels = match MlChannelSelection::from_env(&layout) {
            Ok(selection) => selection,
            Err(e) => {
                error!("Invalid ML channel selection: {}", e);
                return (0, 0);
            }
        };
        info!("ML input uses EEG channels {:?}", ml_channels.indices());

        // Setup pipeline gateway (replaces SignalProcessor)
        // let sig_processor = match SignalProcessor::new(&python_script_path) { ... };
        let gateway = match PipelineGateway::new(&manager_script_path, ml_channels) {
            Ok(g) => g,
            Err(e) => {
                info!("current path: {:?}", std::env::current_dir());
                info!("Looking for manager script at: {}", manager_script_path);
                error!("Failed to initialize pipeline gateway: {}", e);
                return (0, 0);
            }
        };

        // Setup stream and inlet
        let inlet = match setup_eeg_stream(&layout) {
            Ok(inlet) => inlet,
            Err(e) => {
                error!("Failed to setup EEG stream: {}", e);
                return (0, 0);
            }
        };

        // Run collection loop
        run_eeg_collection(
            inlet,
            tx,
            cancel_token,
            processing_config,
            gateway,
            windowing_rx,
            layout,
        )
    });

    // Handle results
    match result.await {
        Ok((count, drop)) => {
            info!(
                "EEG session completed - received: {}, dropped: {}",
                count, drop
            );
        }
        Err(e) => {
            error!("EEG receiver task panicked: {}", e);
        }
    }
}

// Resolves EEG stream and creates inlet for data reception.
// Returns error if no streams found or inlet creation fails.
fn setup_eeg_stream(layout: &ChannelLayout) -> Result<StreamInlet, String> {
    let streams = resolve_bypred("type='EEG'", 1, lsl::FOREVER)
        .map_err(|e| format!("Could not resolve EEG stream: {}", e))?;

    let Some(stream) = streams.first() else {
        return Err("No EEG streams found".to_string());
    };

    // A wider stream is fine (extra channels are ignored), but a narrower one drops every sample.
    let stream_channels = usize::try_from(stream.channel_count()).unwrap_or(0);
    if stream_channels < layout.total() {
        warn!(
            "EEG stream has {} channels but the layout expects {} ({} EEG + {} EMG), so every \
             sample will be dropped. Set EEG_CHANNEL_COUNT / EMG_CHANNEL_COUNT to match the device.",
            stream_channels,
            layout.total(),
            layout.eeg(),
            layout.emg()
        );
    }

    info!(
        "EEG stream found ({} channels), creating inlet",
        stream_channels
    );
    StreamInlet::new(stream, 1000, 0, true)
        .map_err(|e| format!("Could not create StreamInlet: {}", e))
}

// Main EEG data collection loop.
// Returns (successful_count, dropped_count) statistics.
fn run_eeg_collection(
    inlet: StreamInlet,
    tx: Sender<Arc<EEGDataPacket>>,
    cancel_token: CancellationToken,
    config: ProcessingConfig,
    gateway: PipelineGateway,
    windowing_rx: tokio::sync::watch::Receiver<WindowingConfig>,
    layout: ChannelLayout,
) -> (u32, u32) {
    let mut count = 0;
    let mut drop = 0;

    let mut windowing = windowing_rx.borrow().clone();

    // Trailing samples of the previous window, prepended to the next one
    let mut overlap = EEGDataPacket::with_layout(&layout, windowing.overlap_size);
    let mut packet = EEGDataPacket::with_layout(&layout, windowing.chunk_size + 1);

    // Calculate the offset between LSL clock and Unix epoch
    let lsl_to_unix_offset =
        Utc::now().timestamp_nanos_opt().unwrap() as f64 / 1_000_000_000.0 - lsl::local_clock();
    loop {
        if windowing_rx.has_changed().unwrap_or(false) {
            windowing = windowing_rx.borrow().clone();
            info!(
                "Windowing config updated: chunk={}, overlap={}",
                windowing.chunk_size, windowing.overlap_size
            );
            // Discard old buffer and start fresh with new config
            packet.clear();
            overlap.clear();
        }

        // Check for cancellation
        if cancel_token.is_cancelled() {
            info!("EEG data receiver cancelled.");
            // Send any remaining samples before exiting
            if !packet.is_empty() {
                match process_and_send(&mut packet, &gateway, &config, &tx) {
                    Ok(_) => count += 1,
                    Err(e) => {
                        error!("Process/send error: {}", e);
                        drop += 1;
                    }
                }
            }
            break;
        }

        // Pull sample with timeout of 1 sec. If it does not see data for 1s, it returns.
        match inlet.pull_sample(1.0) {
            Ok((sample, timestamp)) => {
                if sample.is_empty() {
                    info!(
                        "Received empty sample from LSL stream (likely during shutdown) - ignoring"
                    );
                    continue;
                }
                let sample_time = unix_seconds_to_utc(timestamp + lsl_to_unix_offset);
                if let Err(e) = packet.push_sample(sample_time, &sample) {
                    drop += 1;
                    error!("Sample processing error (drop #{}): {}", drop, e);
                    continue;
                }
                if packet.len() < windowing.chunk_size {
                    continue; // Sample added, but packet not full yet
                }

                // Window is full. Prepend the overlap from the previous window (if any),
                // then keep this window's tail as the next overlap.
                if windowing.overlap_size > 0 {
                    packet.prepend_overlap(&overlap);
                }
                overlap = packet.tail(windowing.overlap_size);

                info!(
                    "Packet is full, sending window: {} samples (overlap: {})",
                    packet.len(),
                    overlap.len()
                );
                match process_and_send(&mut packet, &gateway, &config, &tx) {
                    Ok(_) => count += 1,
                    Err(e) => {
                        error!("Process/send error: {}", e);
                        drop += 1;
                    }
                }
                packet.clear();
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

// Converts fractional Unix seconds to UTC.
fn unix_seconds_to_utc(timestamp: f64) -> DateTime<Utc> {
    DateTime::from_timestamp(
        timestamp as i64,
        (timestamp.fract() * 1_000_000_000.0) as u32,
    )
    .unwrap_or_else(Utc::now)
}

// calls the Python pipeline manager to process the packet and sends it
fn process_and_send(
    packet: &mut EEGDataPacket,
    gateway: &PipelineGateway,
    config: &ProcessingConfig,
    tx: &Sender<Arc<EEGDataPacket>>,
) -> Result<(), String> {
    if packet.is_empty() {
        return Err("Empty packet".to_string());
    }

    // Call the Python pipeline manager on EEG only; the gateway picks the channel subset
    // the models were trained on. EMG isn't a model input yet.
    info!("starting pipeline processing");
    packet.ml_result = match gateway.call_pipeline(config, &packet.eeg) {
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
    };
    info!("done pipeline processing");

    // Send the processed packet
    tx.send(Arc::new(packet.clone()))
        .map_err(|_| "Send error - no receivers or channel full".to_string())?;

    Ok(())
}
