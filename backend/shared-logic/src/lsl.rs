use std::sync::Arc;

use chrono::{DateTime, Utc};
use log::{error, info};
use lsl::{resolve_bypred, Pullable, StreamInlet};
use serde::{Deserialize, Serialize};
use tokio::sync::broadcast::Sender;
use tokio_util::sync::CancellationToken;
use crate::signal_processing::signal_processor::SignalProcessor;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct EEGDataPacket {
    pub timestamps: Vec<DateTime<Utc>>,
    pub signals: Vec<Vec<f64>>,
}

#[derive(Clone)]
pub struct ProcessingConfig {
    pub apply_bandpass: bool,
    pub use_iir: bool,  // true for IIR, false for FIR
    pub l_freq: Option<f32>,
    pub h_freq: Option<f32>,
    pub downsample_factor: Option<u32>,
    pub sfreq: f32,
    pub n_channels: usize,
}

impl Default for ProcessingConfig {
    fn default() -> Self {
        Self {
            apply_bandpass: true,
            use_iir: false,
            l_freq: Some(1.0),
            h_freq: Some(50.0),
            downsample_factor: None,
            sfreq: 256.0,
            n_channels: 4,
        }
    }
}

// Async entry point for EEG data collection.
pub async fn receive_eeg(tx:Sender<Arc<EEGDataPacket>>, cancel_token: CancellationToken, processing_config: ProcessingConfig) {
    info!("Starting EEG data receiver");
    
    let result = tokio::task::spawn_blocking(move || {
        // Setup signal processor
        let sig_processor = match SignalProcessor::new("../shared-logic/src/signal_processing/signalProcessing.py") {
            Ok(p) => p,
            Err(e) => {
                info!("current path: {:?}", std::env::current_dir());
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
        run_eeg_collection(inlet, tx, cancel_token, processing_config, sig_processor)
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
fn run_eeg_collection(inlet: StreamInlet, tx: Sender<Arc<EEGDataPacket>>, cancel_token: CancellationToken, config: ProcessingConfig, processor: SignalProcessor) -> (u32, u32) {
    let mut count = 0;
    let mut drop = 0;
    let mut packet = EEGDataPacket {
        timestamps: Vec::with_capacity(65),
        signals: vec![Vec::with_capacity(65); 4],
    };
    // Calculate the offset between LSL clock and Unix epoch
    let lsl_to_unix_offset = Utc::now().timestamp_nanos_opt().unwrap() as f64 / 1_000_000_000.0 - lsl::local_clock();
    loop {
        // Check for cancellation
        if cancel_token.is_cancelled() {
            info!("EEG data receiver cancelled.");
            // Send any remaining samples before exiting
             if !packet.signals.is_empty() {
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
                match accumulate_sample(&sample, timestamp + lsl_to_unix_offset, &mut packet) {
                    Ok(true) => {
                        // Packet is full, send it
                        info!("Packet is full, send it");
                         match process_and_send(&mut packet, &processor, &config, &tx) {
                            Ok(_) => count += 1,
                            Err(e) => {
                                error!("Process/send error: {}", e);
                                drop += 1;
                            }
                        }
                        // Reset packet for next batch
                        
                        packet.timestamps.clear();
                        for channel in &mut packet.signals {
                            channel.clear();  
                        }
                    }
                    Ok(false) => {
                        // Sample added, but packet not full yet
                    }
                    Err(e) => {
                        drop += 1;
                        error!("Sample processing error: {}", e);
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
    packet: &mut EEGDataPacket
) -> Result<bool, String> {
    // Validate sample length
    if sample.len() < 4 {
        return Err(format!("Invalid sample length: got {} channels, expected at least 4", sample.len()));
    }

    // Convert timestamp
    let timestamp_dt = DateTime::from_timestamp(
        timestamp as i64, 
        ((timestamp.fract() * 1_000_000_000.0) as u32)
    ).unwrap_or_else(|| Utc::now());
 
    // info!("Raw timestamp: {}, Converted: {:?}", timestamp, timestamp_dt);
    
    // Add sample to packet
    packet.timestamps.push(timestamp_dt);
    // Add sample to each channel
    for (ch_idx, ch_data) in packet.signals.iter_mut().enumerate() {
        ch_data.push(sample[ch_idx] as f64);  // Convert here
    }

    // Check if packet is full
    Ok(packet.signals[0].len() >= 65)
}

// calls the signalProcessing.py to process the packet and sends it
fn process_and_send(
    packet: &mut EEGDataPacket,
    processor: &SignalProcessor,
    config: &ProcessingConfig,
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