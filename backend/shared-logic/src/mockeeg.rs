//! Synthetic EEG source for development without a headset.
//!
//! [`generate_mock_data`] publishes an LSL outlet named `MyStream` (type `EEG`, source id
//! `muse-simulator-eeg`, 4 × float32 channels, nominal 256 Hz). Each sample is uniform random
//! in `[0, 100)`, pushed about every 4 ms, so the real rate is a little under 250 Hz. It runs
//! until the cancellation token fires.
//!
//! Set `MOCK_EEG_FLAT_CHANNEL` to a channel index (0-3) to hold that channel at a constant
//! value, like an unplugged electrode. The EEG Signal Quality node should then show Poor and
//! name that channel.
//!
//! It is started by `bc::start_broadcast` for every connection, and `lsl::receive_eeg` picks
//! the first `EEG` stream it finds. So a real `muselsl` stream and the mock (or several
//! connections' mocks) can be mixed up. The loop uses `thread::sleep`, which blocks a tokio
//! worker thread while it runs.

use log::info;
use lsl::{ChannelFormat, ExPushable, StreamInfo, StreamOutlet};
use rand::Rng;
use std::{thread, time::Duration};
use tokio_util::sync::CancellationToken;

pub async fn generate_mock_data(
    cancel_token: CancellationToken,
) -> Result<(), Box<dyn std::error::Error>> {
    // Create stream info
    let stream_info = StreamInfo::new(
        "MyStream",             // stream name
        "EEG",                  // content type (EEG, EMG, etc.)
        4,                      // number of channels
        256.0,                  // sampling rate (Hz)
        ChannelFormat::Float32, // data format
        "muse-simulator-eeg",   // source ID (should be unique)
    )?;

    // Create outlet
    let outlet = StreamOutlet::new(&stream_info, 0, 360)?; // 0 = default chunk size, 360 = max buffered

    let flat_channel: Option<usize> = std::env::var("MOCK_EEG_FLAT_CHANNEL")
        .ok()
        .and_then(|v| v.trim().parse().ok());
    if let Some(c) = flat_channel {
        info!("Mock EEG: channel {} is flat (MOCK_EEG_FLAT_CHANNEL)", c);
    }

    println!("Stream created. Sending data...");

    // Send data in a loop
    loop {
        if cancel_token.is_cancelled() {
            info!("Cancellation requested, stopping data generation...");
            break;
        }

        // Create sample data (4 channels of float data)
        let sample_data: Vec<f32> = (0..4)
            .map(|c| {
                if flat_channel == Some(c) {
                    50.0
                } else {
                    rand::thread_rng().gen_range(0.0..100.0)
                }
            })
            .collect();

        // Send the sample
        outlet.push_sample_ex(&sample_data, lsl::local_clock(), true)?;
        // Sleep to simulate real-time data
        thread::sleep(Duration::from_millis(4));
    }
    drop(outlet);
    Ok(())
}
