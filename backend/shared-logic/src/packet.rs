//! [`EEGDataPacket`]: one window of samples, the unit that is broadcast to the websocket
//! client and the database writer. Its JSON form is the websocket batch format (see
//! `backend/docs/websocket-protocol.md`).
//!
//! Signals are channel-major and split by kind: `eeg[c][i]` / `emg[c][i]` is channel `c` at
//! `timestamps[i]`. Both kinds share the one `timestamps` vector, so every channel always has
//! exactly `timestamps.len()` samples.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::channels::{column_index, ChannelKind, ChannelLayout, CHANNEL_COLUMN_COUNT};
use crate::models::EegDataRow;
use crate::signal_processing::pipeline_gateway::PipelineOutput;

#[derive(Serialize, Deserialize, Debug, Clone, Default, PartialEq)]
pub struct EEGDataPacket {
    pub timestamps: Vec<DateTime<Utc>>,
    pub eeg: Vec<Vec<f64>>,
    pub emg: Vec<Vec<f64>>,
    pub ml_result: Option<PipelineOutput>,
}

/// A sample that doesn't fit the packet's layout.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SampleLengthError {
    pub got: usize,
    pub expected: usize,
}

impl std::fmt::Display for SampleLengthError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "Invalid sample length: got {} channels, expected at least {}",
            self.got, self.expected
        )
    }
}

impl std::error::Error for SampleLengthError {}

impl EEGDataPacket {
    /// Empty packet with one channel vector per channel in `layout`, each pre-sized to `capacity`.
    pub fn with_layout(layout: &ChannelLayout, capacity: usize) -> Self {
        let channels = |n: usize| (0..n).map(|_| Vec::with_capacity(capacity)).collect();
        Self {
            timestamps: Vec::with_capacity(capacity),
            eeg: channels(layout.eeg()),
            emg: channels(layout.emg()),
            ml_result: None,
        }
    }

    /// The layout this packet was built with.
    pub fn layout(&self) -> ChannelLayout {
        ChannelLayout::new(self.eeg.len(), self.emg.len()).unwrap_or_default()
    }

    /// Number of samples (shared by every channel).
    pub fn len(&self) -> usize {
        self.timestamps.len()
    }

    pub fn is_empty(&self) -> bool {
        self.timestamps.is_empty()
    }

    /// All channels, EEG first then EMG (the LSL sample order).
    pub fn channels(&self) -> impl Iterator<Item = &Vec<f64>> {
        self.eeg.iter().chain(self.emg.iter())
    }

    pub fn channels_mut(&mut self) -> impl Iterator<Item = &mut Vec<f64>> {
        self.eeg.iter_mut().chain(self.emg.iter_mut())
    }

    /// Appends one interleaved sample (`eeg..., emg...`). Extra trailing values are ignored.
    pub fn push_sample(
        &mut self,
        timestamp: DateTime<Utc>,
        sample: &[f32],
    ) -> Result<(), SampleLengthError> {
        let expected = self.eeg.len() + self.emg.len();
        if sample.len() < expected {
            return Err(SampleLengthError {
                got: sample.len(),
                expected,
            });
        }
        self.timestamps.push(timestamp);
        for (channel, &value) in self.channels_mut().zip(sample) {
            channel.push(f64::from(value));
        }
        Ok(())
    }

    /// Removes all samples but keeps the channel layout and allocations.
    pub fn clear(&mut self) {
        self.timestamps.clear();
        self.channels_mut().for_each(Vec::clear);
        self.ml_result = None;
    }

    /// Copy of the last `n` samples (or all of them, if there are fewer).
    pub fn tail(&self, n: usize) -> Self {
        let start = self.len().saturating_sub(n);
        let slice = |chs: &[Vec<f64>]| chs.iter().map(|ch| ch[start..].to_vec()).collect();
        Self {
            timestamps: self.timestamps[start..].to_vec(),
            eeg: slice(&self.eeg),
            emg: slice(&self.emg),
            ml_result: None,
        }
    }

    /// One `eeg_data` row per sample. Channels this packet doesn't carry are `None`.
    pub fn to_rows(&self) -> Vec<EegDataRow> {
        let mut columns: [Option<&[f64]>; CHANNEL_COLUMN_COUNT] = [None; CHANNEL_COLUMN_COUNT];
        for (kind, channels) in [(ChannelKind::Eeg, &self.eeg), (ChannelKind::Emg, &self.emg)] {
            for (i, channel) in channels.iter().take(kind.max_channels()).enumerate() {
                columns[column_index(kind, i)] = Some(channel.as_slice());
            }
        }
        self.timestamps
            .iter()
            .enumerate()
            .map(|(sample, &time)| {
                let values = columns.map(|ch| ch.and_then(|ch| ch.get(sample).copied()));
                EegDataRow::from_channel_values(time, values)
            })
            .collect()
    }

    /// Prepends `prefix`'s samples (the overlap from the previous window).
    ///
    /// Their timestamps are **not** kept: each is replaced with a copy of this packet's first
    /// timestamp, as documented in `websocket-protocol.md` (known issue 3).
    pub fn prepend_overlap(&mut self, prefix: &Self) {
        if prefix.is_empty() || self.is_empty() {
            return;
        }
        let first_ts = self.timestamps[0];
        let mut timestamps = vec![first_ts; prefix.len()];
        timestamps.append(&mut self.timestamps);
        self.timestamps = timestamps;

        for (channel, prefix_channel) in self.channels_mut().zip(prefix.channels()) {
            let mut merged = prefix_channel.clone();
            merged.append(channel);
            *channel = merged;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ts(secs: i64) -> DateTime<Utc> {
        DateTime::from_timestamp(secs, 0).unwrap()
    }

    fn packet_with(layout: ChannelLayout, samples: &[&[f32]]) -> EEGDataPacket {
        let mut packet = EEGDataPacket::with_layout(&layout, samples.len());
        for (i, sample) in samples.iter().enumerate() {
            packet.push_sample(ts(i as i64), sample).unwrap();
        }
        packet
    }

    #[test]
    fn push_sample_splits_eeg_and_emg() {
        let layout = ChannelLayout::new(2, 1).unwrap();
        let packet = packet_with(layout, &[&[1.0, 2.0, 3.0], &[4.0, 5.0, 6.0, 99.0]]);
        assert_eq!(packet.eeg, vec![vec![1.0, 4.0], vec![2.0, 5.0]]);
        assert_eq!(packet.emg, vec![vec![3.0, 6.0]]);
        assert_eq!(packet.len(), 2);
        assert_eq!(packet.layout(), layout);
    }

    #[test]
    fn push_sample_rejects_short_samples() {
        let mut packet = EEGDataPacket::with_layout(&ChannelLayout::default(), 1);
        let err = packet.push_sample(ts(0), &[0.0; 11]).unwrap_err();
        assert_eq!(
            err,
            SampleLengthError {
                got: 11,
                expected: 12
            }
        );
        assert!(packet.is_empty());
        assert!(packet.channels().all(Vec::is_empty));
    }

    #[test]
    fn serializes_eeg_and_emg_fields() {
        let layout = ChannelLayout::new(1, 1).unwrap();
        let json = serde_json::to_value(packet_with(layout, &[&[1.0, 2.0]])).unwrap();
        assert_eq!(json["eeg"], serde_json::json!([[1.0]]));
        assert_eq!(json["emg"], serde_json::json!([[2.0]]));
        assert!(json.get("signals").is_none());
    }

    #[test]
    fn tail_and_prepend_overlap() {
        let layout = ChannelLayout::new(1, 1).unwrap();
        let previous = packet_with(layout, &[&[1.0, 10.0], &[2.0, 20.0], &[3.0, 30.0]]);
        let overlap = previous.tail(2);
        assert_eq!(overlap.eeg, vec![vec![2.0, 3.0]]);

        let mut next = EEGDataPacket::with_layout(&layout, 1);
        next.push_sample(ts(100), &[4.0, 40.0]).unwrap();
        next.prepend_overlap(&overlap);

        assert_eq!(next.eeg, vec![vec![2.0, 3.0, 4.0]]);
        assert_eq!(next.emg, vec![vec![20.0, 30.0, 40.0]]);
        assert_eq!(next.timestamps, vec![ts(100); 3]);
    }

    #[test]
    fn tail_longer_than_packet_returns_everything() {
        let layout = ChannelLayout::new(1, 0).unwrap();
        let packet = packet_with(layout, &[&[1.0]]);
        assert_eq!(packet.tail(5), packet);
    }

    #[test]
    fn to_rows_maps_channels_to_columns() {
        let layout = ChannelLayout::new(2, 1).unwrap();
        let packet = packet_with(layout, &[&[1.0, 2.0, 3.0], &[4.0, 5.0, 6.0]]);
        let rows = packet.to_rows();
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[1].time, ts(1));
        assert_eq!(
            (rows[1].eeg1, rows[1].eeg2, rows[1].eeg3),
            (Some(4.0), Some(5.0), None)
        );
        assert_eq!((rows[1].emg1, rows[1].emg2), (Some(6.0), None));
    }

    #[test]
    fn to_rows_full_layout_fills_every_column() {
        let sample: Vec<f32> = (0..12).map(|v| v as f32).collect();
        let packet = packet_with(ChannelLayout::default(), &[&sample]);
        let values = packet.to_rows()[0].channel_values();
        let expected: Vec<Option<f64>> = (0..12).map(|v| Some(v as f64)).collect();
        assert_eq!(values.to_vec(), expected);
    }

    #[test]
    fn clear_keeps_layout() {
        let layout = ChannelLayout::new(2, 2).unwrap();
        let mut packet = packet_with(layout, &[&[1.0, 2.0, 3.0, 4.0]]);
        packet.clear();
        assert!(packet.is_empty());
        assert_eq!(packet.layout(), layout);
    }
}
