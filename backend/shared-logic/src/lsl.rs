use chrono::{DateTime, Utc};
use log::{error, info};
use lsl::{resolve_bypred, Pullable, StreamInlet};
use serde::{Deserialize, Serialize};
use tokio::sync::broadcast::Sender;
use tokio_util::sync::CancellationToken;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct EEGDataPacket {
    pub timestamps: Vec<DateTime<Utc>>,
    pub signals: Vec<[f32; 4]>,
}

// Async entry point for EEG data collection.
pub async fn receive_eeg(tx: Sender<EEGDataPacket>, cancel_token: CancellationToken) {
    info!("Starting EEG data receiver");
    
    let result = tokio::task::spawn_blocking(move || {
        // Setup stream and inlet
        let inlet = match setup_eeg_stream() {
            Ok(inlet) => inlet,
            Err(e) => {
                error!("Failed to setup EEG stream: {}", e);
                return (0, 0);
            }
        };
        
        // Run collection loop
        run_eeg_collection(inlet, tx, cancel_token)
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
fn run_eeg_collection(inlet: StreamInlet, tx: Sender<EEGDataPacket>, cancel_token: CancellationToken) -> (u32, u32) {
    let mut count = 0;
    let mut drop = 0;
    let mut packet = EEGDataPacket {
        timestamps: Vec::with_capacity(65),
        signals: Vec::with_capacity(65),
    };
    let lsl_to_unix_offset = Utc::now().timestamp_nanos_opt().unwrap() as f64 / 1_000_000_000.0 - lsl::local_clock();

    loop {
        // Check for cancellation
        if cancel_token.is_cancelled() {
            info!("EEG data receiver cancelled.");
            // Send any remaining samples before exiting
             if !packet.signals.is_empty() {
                 let num_samples = packet.signals.len();
                if tx.send(packet).is_ok() {
                    info!("Sent final partial packet with {} samples", num_samples);
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
                        match tx.send(packet.clone()) {
                            Ok(_) => count += 1,
                            Err(_) => {
                                drop += 1;
                                error!("Send error - no receivers or channel full");
                            }
                        }
                        // Reset packet for next batch
                        packet.timestamps.clear();
                        packet.signals.clear();
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
    let nanos = (timestamp * 1_000_000_000.0) as i64;
    // let timestamp_dt = DateTime::from_timestamp_nanos(nanos);
    let timestamp_dt = DateTime::from_timestamp(
        timestamp as i64, 
        ((timestamp.fract() * 1_000_000_000.0) as u32)
    ).unwrap_or_else(|| Utc::now());
 
    info!("Raw timestamp: {}, Converted: {:?}", timestamp, timestamp_dt);
    
    // Add sample to packet
    packet.timestamps.push(timestamp_dt);
    packet.signals.push([sample[0], sample[1], sample[2], sample[3]]);

    // Check if packet is full
    Ok(packet.signals.len() >= 65)
}