//! Synthetic EEG + EMG source for development without a headset.
//!
//! [`generate_mock_data`] publishes an LSL outlet named `MyStream` (type `EEG`, source id
//! `muse-simulator-eeg`, one float32 channel per channel in the session's [`ChannelLayout`],
//! EEG first then EMG, [`MOCK_SAMPLE_RATE_HZ`]). Samples come from [`MockSignalGenerator`],
//! which produces physiologically shaped signals in microvolts so the quality check, filters
//! and charts have something realistic to work on:
//!
//! - **EEG**: theta (6 Hz), alpha (10 Hz, slowly waxing and waning, strongest on the
//!   highest-numbered channels) and beta (20 Hz) rhythms, Gaussian background noise, a small
//!   60 Hz mains component, and an eye blink every 5 s on the first two (frontal) channels.
//! - **EMG**: a quiet Gaussian baseline with a muscle contraction burst (broadband noise,
//!   smooth on/off envelope) for 1 s out of every 4 s, staggered by 1 s per channel, plus
//!   60 Hz mains.
//!
//! Samples are paced against a deadline so the real rate matches the nominal 256 Hz. It runs
//! until the cancellation token fires.
//!
//! It is started by `bc::start_broadcast` for every connection, and `lsl::receive_eeg` picks
//! the first `EEG` stream it finds. So a real `muselsl` stream and the mock (or several
//! connections' mocks) can be mixed up. The loop uses `thread::sleep`, which blocks a tokio
//! worker thread while it runs.

use std::f64::consts::{PI, TAU};
use std::thread;
use std::time::{Duration, Instant};

use log::info;
use lsl::{ChannelFormat, ExPushable, StreamInfo, StreamOutlet};
use rand::rngs::StdRng;
use rand::{Rng, SeedableRng};
use tokio_util::sync::CancellationToken;

use crate::channels::ChannelLayout;

/// Nominal (and paced) sample rate of the mock stream. Matches the default `sfreq`.
pub const MOCK_SAMPLE_RATE_HZ: f64 = 256.0;

const MAINS_HZ: f64 = 60.0;
const MAINS_UV: f64 = 1.0;

// EEG rhythm amplitudes (µV) and frequencies (Hz)
const THETA_HZ: f64 = 6.0;
const THETA_UV: f64 = 8.0;
const ALPHA_HZ: f64 = 10.0;
const ALPHA_UV: f64 = 15.0;
const ALPHA_MODULATION_HZ: f64 = 0.1;
const BETA_HZ: f64 = 20.0;
const BETA_UV: f64 = 4.0;
const EEG_NOISE_UV: f64 = 3.0;

// Eye blinks: a Gaussian bump on the frontal channels
const BLINK_PERIOD_S: f64 = 5.0;
const BLINK_CENTER_S: f64 = 0.25;
const BLINK_WIDTH_S: f64 = 0.05;
const BLINK_UV: f64 = 100.0;
const FRONTAL_CHANNELS: usize = 2;

// EMG: quiet baseline and periodic contraction bursts
const EMG_REST_UV: f64 = 2.0;
const EMG_BURST_UV: f64 = 60.0;
const EMG_BURST_PERIOD_S: f64 = 4.0;
const EMG_BURST_LENGTH_S: f64 = 1.0;
const EMG_BURST_STAGGER_S: f64 = 1.0;

/// Deterministic-given-the-RNG source of interleaved `[eeg..., emg...]` samples.
pub struct MockSignalGenerator<R: Rng> {
    layout: ChannelLayout,
    sample_rate: f64,
    sample_index: u64,
    rng: R,
}

impl<R: Rng> MockSignalGenerator<R> {
    pub fn new(layout: ChannelLayout, sample_rate: f64, rng: R) -> Self {
        Self {
            layout,
            sample_rate,
            sample_index: 0,
            rng,
        }
    }

    /// Next sample, `layout.total()` values: EEG channels then EMG channels.
    pub fn next_sample(&mut self) -> Vec<f32> {
        let t = self.sample_index as f64 / self.sample_rate;
        self.sample_index += 1;

        let mut sample = Vec::with_capacity(self.layout.total());
        for channel in 0..self.layout.eeg() {
            let value = self.eeg_value(t, channel);
            sample.push(value as f32);
        }
        for channel in 0..self.layout.emg() {
            let value = self.emg_value(t, channel);
            sample.push(value as f32);
        }
        sample
    }

    fn eeg_value(&mut self, t: f64, channel: usize) -> f64 {
        // Per-channel phase offset so channels are correlated but not identical
        let phase = channel as f64 * 0.7;
        // Alpha is posterior-dominant: scale from 0.6x on channel 0 up to 1.4x on the last
        let position = channel as f64 / self.layout.eeg().saturating_sub(1).max(1) as f64;
        let alpha_gain =
            (0.6 + 0.8 * position) * (1.0 + 0.5 * (TAU * ALPHA_MODULATION_HZ * t + phase).sin());

        let rhythms = THETA_UV * (TAU * THETA_HZ * t + phase).sin()
            + ALPHA_UV * alpha_gain * (TAU * ALPHA_HZ * t + phase).sin()
            + BETA_UV * (TAU * BETA_HZ * t + 2.0 * phase).sin();

        let blink = if channel < FRONTAL_CHANNELS {
            let dt = t.rem_euclid(BLINK_PERIOD_S) - BLINK_CENTER_S;
            BLINK_UV * (-0.5 * (dt / BLINK_WIDTH_S).powi(2)).exp()
        } else {
            0.0
        };

        rhythms + blink + mains(t) + gaussian(&mut self.rng, EEG_NOISE_UV)
    }

    fn emg_value(&mut self, t: f64, channel: usize) -> f64 {
        let envelope = emg_burst_envelope(t - channel as f64 * EMG_BURST_STAGGER_S);
        let sigma = EMG_REST_UV + (EMG_BURST_UV - EMG_REST_UV) * envelope;
        gaussian(&mut self.rng, sigma) + mains(t)
    }
}

/// 0 at rest, rising smoothly to 1 during a contraction burst (sin² ramp over the burst).
fn emg_burst_envelope(t: f64) -> f64 {
    let in_cycle = t.rem_euclid(EMG_BURST_PERIOD_S);
    if in_cycle < EMG_BURST_LENGTH_S {
        (PI * in_cycle / EMG_BURST_LENGTH_S).sin().powi(2)
    } else {
        0.0
    }
}

fn mains(t: f64) -> f64 {
    MAINS_UV * (TAU * MAINS_HZ * t).sin()
}

/// Zero-mean Gaussian sample (Box-Muller).
fn gaussian(rng: &mut impl Rng, sigma: f64) -> f64 {
    let u1: f64 = rng.gen_range(f64::EPSILON..1.0);
    let u2: f64 = rng.gen();
    sigma * (-2.0 * u1.ln()).sqrt() * (TAU * u2).cos()
}

pub async fn generate_mock_data(
    layout: ChannelLayout,
    cancel_token: CancellationToken,
) -> Result<(), Box<dyn std::error::Error>> {
    let channel_count = layout.total().try_into()?;
    let stream_info = StreamInfo::new(
        "MyStream",             // stream name
        "EEG",                  // content type the acquisition loop resolves on
        channel_count,          // number of channels (EEG then EMG)
        MOCK_SAMPLE_RATE_HZ,    // sampling rate (Hz)
        ChannelFormat::Float32, // data format
        "muse-simulator-eeg",   // source ID (should be unique)
    )?;

    // Create outlet
    let outlet = StreamOutlet::new(&stream_info, 0, 360)?; // 0 = default chunk size, 360 = max buffered

    info!(
        "Mock stream created ({} EEG + {} EMG channels). Sending data...",
        layout.eeg(),
        layout.emg()
    );

    let mut generator =
        MockSignalGenerator::new(layout, MOCK_SAMPLE_RATE_HZ, StdRng::from_entropy());
    let sample_period = Duration::from_secs_f64(1.0 / MOCK_SAMPLE_RATE_HZ);
    let mut next_deadline = Instant::now();

    loop {
        if cancel_token.is_cancelled() {
            info!("Cancellation requested, stopping data generation...");
            break;
        }

        outlet.push_sample_ex(&generator.next_sample(), lsl::local_clock(), true)?;

        // Pace against a deadline so the average rate is exactly MOCK_SAMPLE_RATE_HZ
        next_deadline += sample_period;
        if let Some(wait) = next_deadline.checked_duration_since(Instant::now()) {
            thread::sleep(wait);
        }
    }
    drop(outlet);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn samples(layout: ChannelLayout, seconds: f64) -> Vec<Vec<f32>> {
        let mut generator =
            MockSignalGenerator::new(layout, MOCK_SAMPLE_RATE_HZ, StdRng::seed_from_u64(7));
        let n = (seconds * MOCK_SAMPLE_RATE_HZ) as usize;
        (0..n).map(|_| generator.next_sample()).collect()
    }

    fn channel(samples: &[Vec<f32>], c: usize) -> Vec<f64> {
        samples.iter().map(|s| f64::from(s[c])).collect()
    }

    fn rms(values: &[f64]) -> f64 {
        (values.iter().map(|v| v * v).sum::<f64>() / values.len() as f64).sqrt()
    }

    fn peak(values: &[f64]) -> f64 {
        values.iter().fold(0.0, |m, v| m.max(v.abs()))
    }

    #[test]
    fn sample_matches_layout() {
        for layout in [ChannelLayout::default(), ChannelLayout::new(4, 0).unwrap()] {
            assert!(samples(layout, 0.1)
                .iter()
                .all(|s| s.len() == layout.total()));
        }
    }

    #[test]
    fn eeg_is_in_a_plausible_microvolt_range() {
        let data = samples(ChannelLayout::default(), 10.0);
        for c in 0..8 {
            let ch = channel(&data, c);
            let mean = ch.iter().sum::<f64>() / ch.len() as f64;
            assert!(mean.abs() < 5.0, "channel {} is not zero-mean: {}", c, mean);
            assert!(peak(&ch) < 200.0, "channel {} out of range", c);
            assert!(rms(&ch) > 5.0, "channel {} is flat", c);
        }
    }

    #[test]
    fn blinks_appear_on_frontal_channels_only() {
        let data = samples(ChannelLayout::default(), BLINK_PERIOD_S);
        assert!(peak(&channel(&data, 0)) > 80.0);
        assert!(peak(&channel(&data, 7)) < 80.0);
    }

    #[test]
    fn emg_bursts_are_much_louder_than_rest() {
        let data = samples(ChannelLayout::default(), EMG_BURST_PERIOD_S);
        let emg1 = channel(&data, 8);
        let rate = MOCK_SAMPLE_RATE_HZ as usize;
        // Channel emg1 bursts during [0, 1) s; the middle half of the burst vs. [2, 3) s at rest
        let burst = rms(&emg1[rate / 4..3 * rate / 4]);
        let rest = rms(&emg1[2 * rate..3 * rate]);
        assert!(burst > 10.0 * rest, "burst {} vs rest {}", burst, rest);
    }

    #[test]
    fn emg_channels_are_staggered() {
        let data = samples(ChannelLayout::default(), EMG_BURST_PERIOD_S);
        let rate = MOCK_SAMPLE_RATE_HZ as usize;
        // emg2 (index 9) bursts during [1, 2) s, so it's quiet during emg1's burst
        let emg2 = channel(&data, 9);
        assert!(rms(&emg2[rate / 4..3 * rate / 4]) < 5.0);
        assert!(rms(&emg2[rate + rate / 4..rate + 3 * rate / 4]) > 20.0);
    }
}
