//! Channel layout of the acquisition device.
//!
//! Every LSL sample carries `eeg` EEG channels followed by `emg` EMG channels, in that order.
//! The layout is a property of the hardware, not of the client's pipeline, so it is read from
//! the environment once per session ([`ChannelLayout::from_env`]) rather than sent over the
//! websocket.
//!
//! | Env var             | Default | Max                  |
//! |---------------------|---------|----------------------|
//! | `EEG_CHANNEL_COUNT` | `8`     | [`MAX_EEG_CHANNELS`] |
//! | `EMG_CHANNEL_COUNT` | `4`     | [`MAX_EMG_CHANNELS`] |
//!
//! The maximums match the columns of the `eeg_data` table (`eeg1..eeg8`, `emg1..emg4`).
//! A device with fewer channels (e.g. a 4-channel Muse: `EEG_CHANNEL_COUNT=4`,
//! `EMG_CHANNEL_COUNT=0`) stores `NULL` in the unused columns.

use serde::{Deserialize, Serialize};
use std::fmt;

/// Number of EEG columns in `eeg_data` (`eeg1..eeg8`).
pub const MAX_EEG_CHANNELS: usize = 8;
/// Number of EMG columns in `eeg_data` (`emg1..emg4`).
pub const MAX_EMG_CHANNELS: usize = 4;

pub const EEG_CHANNEL_COUNT_ENV: &str = "EEG_CHANNEL_COUNT";
pub const EMG_CHANNEL_COUNT_ENV: &str = "EMG_CHANNEL_COUNT";

/// Kind of signal a channel carries.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ChannelKind {
    Eeg,
    Emg,
}

impl ChannelKind {
    /// Column/CSV prefix for this kind (`"eeg"` or `"emg"`).
    pub fn prefix(self) -> &'static str {
        match self {
            ChannelKind::Eeg => "eeg",
            ChannelKind::Emg => "emg",
        }
    }

    /// Number of storage columns for this kind.
    pub fn max_channels(self) -> usize {
        match self {
            ChannelKind::Eeg => MAX_EEG_CHANNELS,
            ChannelKind::Emg => MAX_EMG_CHANNELS,
        }
    }
}

/// Total channel columns in `eeg_data`.
pub const CHANNEL_COLUMN_COUNT: usize = MAX_EEG_CHANNELS + MAX_EMG_CHANNELS;

/// `eeg_data` channel columns, in storage order. Also the CSV export/import headers.
/// Fixed strings (not built at runtime) because they are spliced into SQL.
pub const CHANNEL_COLUMNS: [&str; CHANNEL_COLUMN_COUNT] = [
    "eeg1", "eeg2", "eeg3", "eeg4", "eeg5", "eeg6", "eeg7", "eeg8", "emg1", "emg2", "emg3", "emg4",
];

/// Position of a channel in [`CHANNEL_COLUMNS`]: EEG channels first, then EMG.
pub fn column_index(kind: ChannelKind, index: usize) -> usize {
    match kind {
        ChannelKind::Eeg => index,
        ChannelKind::Emg => MAX_EEG_CHANNELS + index,
    }
}

/// Name of a channel's DB column and CSV header, 1-based: `channel_name(Eeg, 0) == "eeg1"`.
pub fn channel_name(kind: ChannelKind, index: usize) -> String {
    format!("{}{}", kind.prefix(), index + 1)
}

/// How many EEG and EMG channels each sample carries.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct ChannelLayout {
    eeg: usize,
    emg: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ChannelLayoutError {
    TooManyChannels {
        kind: ChannelKind,
        requested: usize,
        max: usize,
    },
    NoChannels,
    InvalidEnvValue {
        var: &'static str,
        value: String,
    },
}

impl fmt::Display for ChannelLayoutError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ChannelLayoutError::TooManyChannels {
                kind,
                requested,
                max,
            } => write!(
                f,
                "{} {} channels requested, at most {} are supported",
                requested,
                kind.prefix().to_uppercase(),
                max
            ),
            ChannelLayoutError::NoChannels => write!(f, "channel layout has no channels"),
            ChannelLayoutError::InvalidEnvValue { var, value } => {
                write!(f, "{}={:?} is not a non-negative integer", var, value)
            }
        }
    }
}

impl std::error::Error for ChannelLayoutError {}

impl Default for ChannelLayout {
    /// 8 EEG + 4 EMG, the Signals headset layout.
    fn default() -> Self {
        Self {
            eeg: MAX_EEG_CHANNELS,
            emg: MAX_EMG_CHANNELS,
        }
    }
}

impl ChannelLayout {
    pub fn new(eeg: usize, emg: usize) -> Result<Self, ChannelLayoutError> {
        for (kind, requested) in [(ChannelKind::Eeg, eeg), (ChannelKind::Emg, emg)] {
            if requested > kind.max_channels() {
                return Err(ChannelLayoutError::TooManyChannels {
                    kind,
                    requested,
                    max: kind.max_channels(),
                });
            }
        }
        if eeg + emg == 0 {
            return Err(ChannelLayoutError::NoChannels);
        }
        Ok(Self { eeg, emg })
    }

    /// Reads `EEG_CHANNEL_COUNT` / `EMG_CHANNEL_COUNT`, using the default for unset vars.
    pub fn from_env() -> Result<Self, ChannelLayoutError> {
        Self::from_lookup(|key| std::env::var(key).ok())
    }

    /// Like [`from_env`](Self::from_env), with an injectable lookup (for tests).
    pub fn from_lookup(
        lookup: impl Fn(&str) -> Option<String>,
    ) -> Result<Self, ChannelLayoutError> {
        let defaults = Self::default();
        let read = |var: &'static str, default: usize| match lookup(var) {
            None => Ok(default),
            Some(value) => value
                .trim()
                .parse::<usize>()
                .map_err(|_| ChannelLayoutError::InvalidEnvValue { var, value }),
        };
        Self::new(
            read(EEG_CHANNEL_COUNT_ENV, defaults.eeg)?,
            read(EMG_CHANNEL_COUNT_ENV, defaults.emg)?,
        )
    }

    pub fn eeg(&self) -> usize {
        self.eeg
    }

    pub fn emg(&self) -> usize {
        self.emg
    }

    /// Channels per LSL sample (`eeg + emg`).
    pub fn total(&self) -> usize {
        self.eeg + self.emg
    }

    pub fn count(&self, kind: ChannelKind) -> usize {
        match kind {
            ChannelKind::Eeg => self.eeg,
            ChannelKind::Emg => self.emg,
        }
    }

    /// Splits one interleaved LSL sample into its EEG and EMG parts.
    /// Extra trailing values beyond [`total`](Self::total) are ignored.
    pub fn split<'a, T>(&self, sample: &'a [T]) -> Option<(&'a [T], &'a [T])> {
        if sample.len() < self.total() {
            return None;
        }
        let (eeg, rest) = sample.split_at(self.eeg);
        Some((eeg, &rest[..self.emg]))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn lookup(vars: &[(&str, &str)]) -> impl Fn(&str) -> Option<String> {
        let map: HashMap<String, String> = vars
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect();
        move |k| map.get(k).cloned()
    }

    #[test]
    fn default_is_8_eeg_4_emg() {
        let layout = ChannelLayout::default();
        assert_eq!((layout.eeg(), layout.emg(), layout.total()), (8, 4, 12));
    }

    #[test]
    fn from_lookup_uses_defaults_when_unset() {
        assert_eq!(
            ChannelLayout::from_lookup(lookup(&[])).unwrap(),
            ChannelLayout::default()
        );
    }

    #[test]
    fn from_lookup_reads_overrides() {
        let layout = ChannelLayout::from_lookup(lookup(&[
            (EEG_CHANNEL_COUNT_ENV, "4"),
            (EMG_CHANNEL_COUNT_ENV, " 0 "),
        ]))
        .unwrap();
        assert_eq!((layout.eeg(), layout.emg()), (4, 0));
    }

    #[test]
    fn rejects_invalid_layouts() {
        assert!(matches!(
            ChannelLayout::new(9, 0),
            Err(ChannelLayoutError::TooManyChannels { .. })
        ));
        assert!(matches!(
            ChannelLayout::new(0, 5),
            Err(ChannelLayoutError::TooManyChannels { .. })
        ));
        assert_eq!(
            ChannelLayout::new(0, 0),
            Err(ChannelLayoutError::NoChannels)
        );
        assert!(matches!(
            ChannelLayout::from_lookup(lookup(&[(EEG_CHANNEL_COUNT_ENV, "eight")])),
            Err(ChannelLayoutError::InvalidEnvValue { .. })
        ));
    }

    #[test]
    fn split_separates_eeg_and_emg() {
        let layout = ChannelLayout::new(3, 2).unwrap();
        let sample = [1, 2, 3, 4, 5, 6];
        assert_eq!(layout.split(&sample), Some((&[1, 2, 3][..], &[4, 5][..])));
        assert_eq!(layout.split(&sample[..4]), None);
    }

    #[test]
    fn channel_names_match_db_columns() {
        for kind in [ChannelKind::Eeg, ChannelKind::Emg] {
            for i in 0..kind.max_channels() {
                assert_eq!(
                    CHANNEL_COLUMNS[column_index(kind, i)],
                    channel_name(kind, i)
                );
            }
        }
        assert_eq!(CHANNEL_COLUMNS[0], "eeg1");
        assert_eq!(CHANNEL_COLUMNS[CHANNEL_COLUMN_COUNT - 1], "emg4");
    }
}
