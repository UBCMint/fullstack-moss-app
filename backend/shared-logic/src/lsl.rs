use std::sync::Arc;

use chrono::{DateTime, Utc};
use log::{error, info};
use lsl::{resolve_bypred, Pullable, StreamInlet};
use serde::{Deserialize, Serialize};
use tokio::sync::broadcast::Sender;
use tokio_util::sync::CancellationToken;
use crate::signal_processing::signal_processor::SignalProcessor;
use crate::pipeline::{Pipeline, PreprocessingConfig, WindowConfig};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct EEGDataPacket {
    pub timestamps: Vec<DateTime<Utc>>,
    pub signals: Vec<Vec<f64>>,
}

// Async entry point for EEG data collection.
pub async fn receive_eeg(tx: Sender<Arc<EEGDataPacket>>, cancel_token: CancellationToken, pipeline: Pipeline) {
    info!("Starting EEG data receiver");

    // Extract configs from the pipeline, falling back to defaults if a node is missing
    let preprocessing_config = pipeline.preprocessing_config().cloned().unwrap_or_default();
    let window_config = pipeline.window_config().cloned().unwrap_or_default();
    info!("Received preprocessing config: apply_bandpass={}, l_freq={:?}, h_freq={:?}",
        preprocessing_config.apply_bandpass, preprocessing_config.l_freq, preprocessing_config.h_freq);

    // Create a watch channel from the initial window config.
    // The receiver is passed into the collection loop so it can react to future updates.
    let (_windowing_tx, windowing_rx) = tokio::sync::watch::channel(window_config);

    let python_script_path = std::env::var("SIGNAL_PROCESSING_SCRIPT")
    .unwrap_or_else(|_| "../shared-logic/src/signal_processing/signalProcessing.py".to_string());

    let result = tokio::task::spawn_blocking(move || {
        // Setup signal processor
        let sig_processor = match SignalProcessor::new(&python_script_path) {
            Ok(p) => p,
            Err(e) => {
                info!("current path: {:?}", std::env::current_dir());
                info!("Looking for Python script at: {}", python_script_path);
                error!("Failed to initialize signal processor: {}", e);
                return (0, 0);
            }
        };

        // Setup stream and inlet
        let inlet = match setup_eeg_stream() {
            Ok(inlet) => inlet,
            Err(e) => {
                error!("Failed to setup EEG stream: {}", e);
                return (0, 0);
            }
        };

        // Run collection loop
        run_eeg_collection(inlet, tx, cancel_token, preprocessing_config, sig_processor, windowing_rx)
    });

    // Handle results
    match result.await {
        Ok((count, drop)) => {
            info!("EEG session completed - received: {}, dropped: {}", count, drop);
        }
        Err(e) => {
            error!("EEG receiver task panicked: {}", e);
        }
    }
}


// Resolves EEG stream and creates inlet for data reception.
// Returns error if no streams found or inlet creation fails.
fn setup_eeg_stream() -> Result<StreamInlet, String> {
    let streams = resolve_bypred("type='EEG'", 1, lsl::FOREVER)
        .map_err(|e| format!("Could not resolve EEG stream: {}", e))?;

    if streams.is_empty() {
        return Err("No EEG streams found".to_string());
    }
    
    info!("EEG stream found, creating inlet");
    StreamInlet::new(&streams[0], 1000, 0, true)
        .map_err(|e| format!("Could not create StreamInlet: {}", e))
}


// Main EEG data collection loop.
// Returns (successful_count, dropped_count) statistics.
fn run_eeg_collection(inlet: StreamInlet,
    tx: Sender<Arc<EEGDataPacket>>,
    cancel_token: CancellationToken,
    config: PreprocessingConfig,
    processor: SignalProcessor,
    mut windowing_rx: tokio::sync::watch::Receiver<WindowConfig>,
) -> (u32, u32) {
    let mut count = 0;
    let mut drop = 0;

    
    let mut windowing = windowing_rx.borrow().clone();

    // Creates a buffer that stores overlapping eeg samples
    let mut overlap_buffer: Vec<Vec<f64>> = vec![Vec::new(); 4];

    let mut packet = EEGDataPacket {
        timestamps: Vec::with_capacity(windowing.chunk_size + 1),
        signals: vec![Vec::with_capacity(windowing.chunk_size + 1); 4],
    };

    // Calculate the offset between LSL clock and Unix epoch
    let lsl_to_unix_offset = Utc::now().timestamp_nanos_opt().unwrap() as f64 / 1_000_000_000.0 - lsl::local_clock();
    loop {
        if windowing_rx.has_changed().unwrap_or(false) {
            windowing = windowing_rx.borrow().clone();
            info!("Windowing config updated: chunk={}, overlap={}", windowing.chunk_size, windowing.overlap_size);
            // Discard old buffer and start fresh with new config
            packet.timestamps.clear();
            for ch in &mut packet.signals { ch.clear(); }
            for ch in &mut overlap_buffer { ch.clear(); }
        }

        // Check for cancellation
        if cancel_token.is_cancelled() {
            info!("EEG data receiver cancelled.");
            // Send any remaining samples before exiting
             if !packet.timestamps.is_empty() {
                 let num_samples = packet.timestamps.len();
                match process_and_send(&mut packet, &processor, &config, &tx) {
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
                match accumulate_sample(&sample, timestamp + lsl_to_unix_offset, &mut packet, windowing.chunk_size) {
                    Ok(true) => {
                        // Window is full. Prepend overlap from previous window if there are any
                        if windowing.overlap_size > 0 && !overlap_buffer[0].is_empty() {
                            // Insert overlap samples at the front of the packet
                            for (ch_idx, ch) in packet.signals.iter_mut().enumerate() {
                                let mut new_ch = overlap_buffer[ch_idx].clone();
                                new_ch.extend_from_slice(ch);
                                *ch = new_ch;
                            }

                            // Timestamps: prepend placeholders (or track overlap timestamps)
                            // For simplicity, pad with copies of the first timestamp
                            let first_ts = packet.timestamps[0];
                            let mut new_ts = vec![first_ts; windowing.overlap_size];
                            new_ts.extend_from_slice(&packet.timestamps);
                            packet.timestamps = new_ts;
                        }

                        // Save the tail as the new overlap_buffer
                        let n = packet.signals[0].len();
                        let keep = windowing.overlap_size.min(n);
                        for (ch_idx, ch) in packet.signals.iter().enumerate() {
                            overlap_buffer[ch_idx] = ch[n - keep..].to_vec();
                        }
                        
                        // Packet is full, send it
                        info!("Packet is full, sending window: {} samples (overlap: {})", packet.signals[0].len(), keep);
                         match process_and_send(&mut packet, &processor, &config, &tx) {
                            Ok(_) => count += 1,
                            Err(e) => {
                                error!("Process/send error: {}", e);
                                drop += 1;
                            }
                        }
                        packet.timestamps.clear();
                        for channel in &mut packet.signals {
                            channel.clear();  
                        }
                    }
                    Ok(false) => {} // Sample added, but packet not full yet
                    Err(e) => {
                         let error_msg = e.to_string();
                        if error_msg.contains("Invalid sample length: got 0 channels") {
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

// Accumulates LSL sample into EEGDataPacket.
// Returns Ok(true) when packet reaches 65 samples, Ok(false) otherwise.
// Requires at least 4 channels in sample.
fn accumulate_sample(
    sample: &[f32], 
    timestamp: f64, 
    packet: &mut EEGDataPacket,
    chunk_size: usize,
) -> Result<bool, String> {
    // Validate sample length
    if sample.len() < 4 {
        return Err(format!("Invalid sample length: got {} channels, expected at least 4", sample.len()));
    }

    // Convert timestamp
    let timestamp_dt = DateTime::from_timestamp(
        timestamp as i64,
        (timestamp.fract() * 1_000_000_000.0) as u32
    ).unwrap_or_else(|| Utc::now());
 
    // info!("Raw timestamp: {}, Converted: {:?}", timestamp, timestamp_dt);
    
    // Add sample to packet
    packet.timestamps.push(timestamp_dt);
    // Add sample to each channel
    for (ch_idx, ch_data) in packet.signals.iter_mut().enumerate() {
        ch_data.push(sample[ch_idx] as f64);  // Convert here
    }

    // Check if packet is full
    Ok(packet.signals[0].len() >= chunk_size)
}

// calls the signalProcessing.py to process the packet and sends it
fn process_and_send(
    packet: &mut EEGDataPacket,
    processor: &SignalProcessor,
    config: &PreprocessingConfig,
    tx: &Sender<Arc<EEGDataPacket>>,
) -> Result<(), String> {
    if packet.timestamps.is_empty() {
        return Err("Empty packet".to_string());
    }

    // Apply bandpass filter
    info!("starting signal processing");
    info!("Before: {:?}", packet.signals);
    if config.apply_bandpass {
        packet.signals = if config.use_iir {
            processor.apply_iir_bandpass(&packet.signals, config.sfreq, config.l_freq, config.h_freq)?
        } else {
            processor.apply_fir_bandpass(&packet.signals, config.sfreq, config.l_freq, config.h_freq)?
        };
    }
    info!("done signal processing");
    info!("after: {:?}", packet.signals);

    //  // Log last 5 samples before filtering
    // for (ch_idx, channel) in packet.signals.iter().enumerate() {
    //     let start = channel.len().saturating_sub(5);
    //     info!("Before ch{}: {:?}", ch_idx, &channel[start..]);
    // }
    // // Log last 5 samples after filtering
    // for (ch_idx, channel) in packet.signals.iter().enumerate() {
    //     let start = channel.len().saturating_sub(5);
    //     info!("After ch{}: {:?}", ch_idx, &channel[start..]);
    // }

    // // Apply downsampling
    // if let Some(factor) = config.downsample_factor {
    //     packet.signals = processor.downsample(&packet.signals, factor)?;
        
    //     // Adjust timestamps to match downsampled data
    //     let new_n_samples = packet.signals[0].len();
    //     let step = packet.timestamps.len() / new_n_samples;
    //     packet.timestamps = packet.timestamps.iter()
    //         .step_by(step.max(1))
    //         .take(new_n_samples)
    //         .cloned()
    //         .collect();
    // }

    // Send the processed packet
    tx.send(Arc::new(packet.clone()))
        .map_err(|_| "Send error - no receivers or channel full".to_string())?;

    Ok(())
}