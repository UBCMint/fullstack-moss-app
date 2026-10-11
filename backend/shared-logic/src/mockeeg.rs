use log::info;
use lsl::{ChannelFormat, ExPushable, StreamInfo, StreamOutlet};
use rand::Rng;
use std::{thread, time::Duration, time::Instant};
use tokio_util::sync::CancellationToken;

use crate::models::{NUM_CHANNELS, NUM_EEG};

const SAMPLING_RATE_HZ: f32 = 256.0;
const SAMPLE_PERIOD_MS: u64 = 4;

pub async fn generate_mock_data(
    cancel_token: CancellationToken,
) -> Result<(), Box<dyn std::error::Error>> {
    let stream_info = StreamInfo::new(
        "MyStream",
        "EEG",
        NUM_CHANNELS as u32,
        SAMPLING_RATE_HZ as f64,
        ChannelFormat::Float32,
        "muse-simulator-eeg",
    )?;

    let outlet = StreamOutlet::new(&stream_info, 0, 360)?;

    println!(
        "Stream created ({} channels). Sending data...",
        NUM_CHANNELS
    );

    let start = Instant::now();

    loop {
        if cancel_token.is_cancelled() {
            info!("Cancellation requested, stopping data generation...");
            break;
        }

        let t = start.elapsed().as_secs_f32();
        let sample_data = build_sample(t);

        outlet.push_sample_ex(&sample_data, lsl::local_clock(), true)?;
        thread::sleep(Duration::from_millis(SAMPLE_PERIOD_MS));
    }
    drop(outlet);
    Ok(())
}

// Generates one 12-channel sample at time `t` (seconds).
// Channels 0..8 are EEG-like (alpha/beta band mixes, ~10-40 uV).
// Channels 8..12 are EMG-like (higher amplitude bursts, ~100-500 uV).
fn build_sample(t: f32) -> Vec<f32> {
    let mut rng = rand::thread_rng();
    let mut sample = Vec::with_capacity(NUM_CHANNELS);

    for ch in 0..NUM_EEG {
        // Each EEG channel gets a slightly different alpha/beta blend + noise.
        let alpha_freq = 10.0 + ch as f32 * 0.3;
        let beta_freq = 20.0 + ch as f32 * 0.5;
        let phase = ch as f32 * 0.4;
        let signal = 20.0 * (2.0 * std::f32::consts::PI * alpha_freq * t + phase).sin()
            + 8.0 * (2.0 * std::f32::consts::PI * beta_freq * t).sin()
            + rng.gen_range(-3.0..3.0);
        sample.push(signal);
    }

    for ch in 0..(NUM_CHANNELS - NUM_EEG) {
        // EMG: higher-amplitude, higher-frequency bursts modulated by a slow envelope.
        let burst_freq = 60.0 + ch as f32 * 15.0;
        let envelope = (2.0 * std::f32::consts::PI * (0.5 + ch as f32 * 0.2) * t)
            .sin()
            .abs();
        let signal = 200.0 * envelope * (2.0 * std::f32::consts::PI * burst_freq * t).sin()
            + rng.gen_range(-20.0..20.0);
        sample.push(signal);
    }

    sample
}
