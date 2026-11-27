//! Signal-quality check behind the EEG and EMG Signal Quality nodes.
//!
//! [`assess`] looks at one window of one channel group and rates it Strong, Moderate or Poor,
//! with the problems found on each channel. The per-channel checks and thresholds are the
//! ones in `check_eeg_quality_moss` (`signalProcessing.py`); the overall level is ours and
//! still needs sign-off from Signals (see `backend/docs/pipeline-nodes.md`).

use std::f64::consts::PI;
use std::ops::Range;

use serde::{Deserialize, Serialize};

// below this variance (after removing the mean) the channel is flat
const FLATLINE_VARIANCE: f64 = 0.1;
// above this amplitude (after removing the mean) the amplifier is railing
const RAILING_AMPLITUDE: f64 = 50_000.0;
// share of the window's power at 60 Hz above which the channel counts as line noise
const LINE_NOISE_RATIO: f64 = 0.4;
const LINE_FREQ_HZ: f64 = 60.0;
// fewer samples than this can't be rated (one sample always looks flat), so no report
pub const MIN_SAMPLES: usize = 10;

// Which stream channels carry which signal. Today's source is a 4-channel EEG headset with no
// EMG, so the EMG node reports NoSignal. Update both when 31A (8 EEG + 4 EMG) lands.
pub const EEG_CHANNELS: Range<usize> = 0..4;
pub const EMG_CHANNELS: Range<usize> = 4..4;

#[derive(Deserialize, Serialize, Debug, Clone, Copy, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum SignalKind {
    #[default]
    Eeg,
    Emg,
}

impl SignalKind {
    pub fn channels(self) -> Range<usize> {
        match self {
            SignalKind::Eeg => EEG_CHANNELS,
            SignalKind::Emg => EMG_CHANNELS,
        }
    }
}

#[derive(Deserialize, Serialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum QualityLevel {
    Strong,
    Moderate,
    Poor,
    // no channels for this signal in the stream, or every channel is empty
    NoSignal,
}

#[derive(Deserialize, Serialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ChannelIssue {
    Empty,
    Flatline,
    Railing,
    LineNoise,
}

impl ChannelIssue {
    // these mean the electrode isn't reading at all, so one is enough for Poor
    fn is_severe(self) -> bool {
        matches!(
            self,
            ChannelIssue::Empty | ChannelIssue::Flatline | ChannelIssue::Railing
        )
    }
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
pub struct ChannelQuality {
    // index into the stream's channels
    pub channel: usize,
    pub issues: Vec<ChannelIssue>,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
pub struct QualityReport {
    pub node_id: String,
    pub signal: SignalKind,
    pub level: QualityLevel,
    pub channels: Vec<ChannelQuality>,
}

impl QualityReport {
    pub fn failing_channels(&self) -> impl Iterator<Item = &ChannelQuality> {
        self.channels.iter().filter(|c| !c.issues.is_empty())
    }
}

/// Rates `channels` of `signals` (channel-major, sampled at `sfreq`).
///
/// - Strong: every channel passes.
/// - Moderate: at most half the channels fail, and only from line noise.
/// - Poor: more than half fail, or any channel is empty, flat or railing.
/// - NoSignal: there are no channels to check, or all of them are empty.
///
/// Returns None when the window is shorter than [`MIN_SAMPLES`] (like the last batch of a
/// session), since there's too little to judge.
pub fn assess(
    node_id: &str,
    signal: SignalKind,
    signals: &[Vec<f64>],
    channels: Range<usize>,
    sfreq: f64,
) -> Option<QualityReport> {
    if signals.first().is_some_and(|ch| ch.len() < MIN_SAMPLES) {
        return None;
    }
    let channels: Vec<ChannelQuality> = channels
        .filter_map(|c| {
            signals.get(c).map(|data| ChannelQuality {
                channel: c,
                issues: channel_issues(data, sfreq),
            })
        })
        .collect();

    let failing = channels.iter().filter(|c| !c.issues.is_empty()).count();
    let level = if channels.is_empty() || channels.iter().all(|c| c.issues == [ChannelIssue::Empty])
    {
        QualityLevel::NoSignal
    } else if channels
        .iter()
        .any(|c| c.issues.iter().any(|i| i.is_severe()))
        || failing * 2 > channels.len()
    {
        QualityLevel::Poor
    } else if failing > 0 {
        QualityLevel::Moderate
    } else {
        QualityLevel::Strong
    };

    Some(QualityReport {
        node_id: node_id.to_string(),
        signal,
        level,
        channels,
    })
}

fn channel_issues(data: &[f64], sfreq: f64) -> Vec<ChannelIssue> {
    let signal: Vec<f64> = data.iter().copied().filter(|v| v.is_finite()).collect();
    if signal.is_empty() {
        return vec![ChannelIssue::Empty];
    }

    let n = signal.len() as f64;
    let mean = signal.iter().sum::<f64>() / n;
    let centered: Vec<f64> = signal.iter().map(|v| v - mean).collect();

    let mut issues = Vec::new();
    let variance = centered.iter().map(|v| v * v).sum::<f64>() / n;
    if variance < FLATLINE_VARIANCE {
        issues.push(ChannelIssue::Flatline);
    }
    if centered.iter().any(|v| v.abs() > RAILING_AMPLITUDE) {
        issues.push(ChannelIssue::Railing);
    }
    if line_noise_ratio(&centered, sfreq).is_some_and(|r| r > LINE_NOISE_RATIO) {
        issues.push(ChannelIssue::LineNoise);
    }
    issues
}

// Share of the window's (Hann-windowed, one-sided) power in the bin nearest 60 Hz: what
// scipy's welch gives in the Python check when the window is at most 1024 samples.
fn line_noise_ratio(centered: &[f64], sfreq: f64) -> Option<f64> {
    let n = centered.len();
    if n < MIN_SAMPLES || LINE_FREQ_HZ >= sfreq / 2.0 {
        return None;
    }
    let windowed: Vec<f64> = centered
        .iter()
        .enumerate()
        .map(|(i, v)| v * 0.5 * (1.0 - (2.0 * PI * i as f64 / n as f64).cos()))
        .collect();

    let total: f64 = windowed.iter().map(|v| v * v).sum::<f64>() * n as f64;
    if total <= 0.0 {
        return None;
    }

    let k = (LINE_FREQ_HZ * n as f64 / sfreq).round();
    let (re, im) = windowed
        .iter()
        .enumerate()
        .fold((0.0, 0.0), |(re, im), (i, v)| {
            let angle = -2.0 * PI * k * i as f64 / n as f64;
            (re + v * angle.cos(), im + v * angle.sin())
        });
    // one-sided: the 60 Hz bin counts twice (positive and negative frequency)
    Some(2.0 * (re * re + im * im) / total)
}

#[cfg(test)]
mod tests {
    use super::*;

    const FS: f64 = 256.0;

    fn noise(seed: u64, n: usize) -> Vec<f64> {
        // small LCG so the tests don't need a rand dependency
        let mut x = seed;
        (0..n)
            .map(|_| {
                x = x.wrapping_mul(6364136223846793005).wrapping_add(1);
                (x >> 33) as f64 / (1u64 << 31) as f64 * 100.0
            })
            .collect()
    }

    fn sine(freq: f64, amp: f64, n: usize) -> Vec<f64> {
        (0..n)
            .map(|i| amp * (2.0 * PI * freq * i as f64 / FS).sin())
            .collect()
    }

    fn eeg(signals: &[Vec<f64>]) -> QualityReport {
        assess("q", SignalKind::Eeg, signals, 0..signals.len(), FS).unwrap()
    }

    #[test]
    fn clean_noise_is_strong() {
        let signals: Vec<_> = (0..4).map(|c| noise(c, 256)).collect();
        let r = eeg(&signals);
        assert_eq!(r.level, QualityLevel::Strong);
        assert_eq!(r.failing_channels().count(), 0);
    }

    #[test]
    fn one_flat_channel_is_poor_and_named() {
        let mut signals: Vec<_> = (0..4).map(|c| noise(c, 256)).collect();
        signals[2] = vec![42.0; 256];
        let r = eeg(&signals);
        assert_eq!(r.level, QualityLevel::Poor);
        let failing: Vec<_> = r.failing_channels().collect();
        assert_eq!(failing.len(), 1);
        assert_eq!(failing[0].channel, 2);
        assert_eq!(failing[0].issues, [ChannelIssue::Flatline]);
    }

    #[test]
    fn railing_is_poor() {
        let mut signals: Vec<_> = (0..4).map(|c| noise(c, 256)).collect();
        signals[0][100] = 80_000.0;
        let r = eeg(&signals);
        assert_eq!(r.level, QualityLevel::Poor);
        assert!(r.channels[0].issues.contains(&ChannelIssue::Railing));
    }

    #[test]
    fn line_noise_on_one_channel_is_moderate_on_most_is_poor() {
        let mut signals: Vec<_> = (0..4).map(|c| noise(c, 256)).collect();
        signals[1] = sine(60.0, 500.0, 256);
        let r = eeg(&signals);
        assert_eq!(r.channels[1].issues, [ChannelIssue::LineNoise]);
        assert_eq!(r.level, QualityLevel::Moderate);

        for s in signals.iter_mut().take(3) {
            *s = sine(60.0, 500.0, 256);
        }
        assert_eq!(eeg(&signals).level, QualityLevel::Poor);
    }

    #[test]
    fn other_frequencies_are_not_line_noise() {
        let signals = vec![sine(10.0, 500.0, 256)];
        assert_eq!(eeg(&signals).level, QualityLevel::Strong);
    }

    #[test]
    fn no_channels_or_all_nan_is_no_signal() {
        let signals: Vec<_> = (0..4).map(|c| noise(c, 256)).collect();
        let r = assess("q", SignalKind::Emg, &signals, 4..4, FS).unwrap();
        assert_eq!(r.level, QualityLevel::NoSignal);
        assert!(r.channels.is_empty());

        let nan = vec![vec![f64::NAN; 64]; 2];
        assert_eq!(eeg(&nan).level, QualityLevel::NoSignal);
    }

    #[test]
    fn too_short_to_rate_gives_no_report() {
        let signals = vec![vec![1.0; MIN_SAMPLES - 1]; 4];
        assert_eq!(assess("q", SignalKind::Eeg, &signals, 0..4, FS), None);
    }

    #[test]
    fn serializes_for_the_client() {
        let mut signals: Vec<_> = (0..2).map(|c| noise(c, 64)).collect();
        signals[1] = vec![0.0; 64];
        let json = serde_json::to_value(eeg(&signals)).unwrap();
        assert_eq!(
            json,
            serde_json::json!({
                "node_id": "q",
                "signal": "eeg",
                "level": "poor",
                "channels": [
                    {"channel": 0, "issues": []},
                    {"channel": 1, "issues": ["flatline"]}
                ]
            })
        );
    }
}
