
use lsl::{ChannelFormat, ExPushable, StreamInfo, StreamOutlet};
use rand::Rng;
use std::{thread, time::Duration};
use tokio_util::sync::CancellationToken;
use log::{info};

pub async fn generate_mock_data(cancel_token: CancellationToken) -> Result<(), Box<dyn std::error::Error>> {
    // Create stream info
    let stream_info = StreamInfo::new(
        "MyStream",           // stream name
        "EEG",               // content type (EEG, EMG, etc.)
        4,                   // number of channels
        256.0,               // sampling rate (Hz)
        ChannelFormat::Float32, // data format
        "muse-simulator-eeg" // source ID (should be unique)
    )?;

    // Create outlet
    let outlet = StreamOutlet::new(&stream_info, 0, 360)?; // 0 = default chunk size, 360 = max buffered

    println!("Stream created. Sending data...");

    // Send data in a loop
    loop {
         if cancel_token.is_cancelled() {
            info!("Cancellation requested, stopping data generation...");
            break;
        }

        // Create sample data (4 channels of float data)
        let sample_data: Vec<f32> = (0..4)
            .map(|_| rand::thread_rng().gen_range(0.0..100.0))
            .collect();

        // Send the sample
        outlet.push_sample_ex(&sample_data, lsl::local_clock(), true)?;
        // Sleep to simulate real-time data 
        thread::sleep(Duration::from_millis(4));

    }
    drop(outlet);
    Ok(())
}
