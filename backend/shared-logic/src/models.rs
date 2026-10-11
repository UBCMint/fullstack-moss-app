use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use serde_json::Value;

// Existing User struct (used for data coming OUT of the DB)
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, sqlx::FromRow)]
pub struct User {
    pub id: i32,
    pub username: String,
    pub email: String,
    pub password_hash: String, // store hashed password
}

// Struct for creating a user (used for data coming INTO the API)
// Because User derived Deserialize, the serde library (which Axum used to process incoming JSON request body)
// expected all fields in User struct to be present in JSON you sent (id was not part of payload)
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct NewUser {
    pub username: String,
    pub email: String,
    pub password: String, // raw password comes from API request
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct TimeSeriesData {
    pub id: i32,
    pub timestamp: DateTime<Utc>,
    pub value: f64,
    pub metadata: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateUser {
    pub username: Option<String>,
    pub email: Option<String>,
    pub password: Option<String>, // new field for updating password
}

// Struct for session data
#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Session {
    pub id: i32,
    pub name: String,
}

// Struct for frontend state associated with a session
#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct FrontendState {
    pub session_id: i32,
    pub data: Value,
    pub updated_at: chrono::DateTime<Utc>,
}

// Struct for a time label row coming OUT of the DB (includes all columns)
#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct TimeLabel {
    pub id: i32,
    pub session_id: i32,
    pub start_timestamp: DateTime<Utc>,
    pub end_timestamp: Option<DateTime<Utc>>,
    pub label: String,
    pub color: String,
}

// Struct for a time label coming INTO the API from the frontend
// No id (auto-generated) or session_id (comes from URL path)
#[derive(Debug, Serialize, Deserialize)]
pub struct NewTimeLabel {
    pub start_timestamp: DateTime<Utc>,
    pub end_timestamp: Option<DateTime<Utc>>,
    pub label: String,
    pub color: String,
}

pub const NUM_EEG: usize = 8;
pub const NUM_EMG: usize = 4;
pub const NUM_CHANNELS: usize = NUM_EEG + NUM_EMG;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ChannelType {
    Eeg,
    Emg,
}

pub const DEFAULT_CHANNEL_LABELS: [&str; NUM_CHANNELS] = [
    "EEG1", "EEG2", "EEG3", "EEG4", "EEG5", "EEG6", "EEG7", "EEG8", "EMG1", "EMG2", "EMG3", "EMG4",
];

pub const DEFAULT_CHANNEL_TYPES: [ChannelType; NUM_CHANNELS] = [
    ChannelType::Eeg,
    ChannelType::Eeg,
    ChannelType::Eeg,
    ChannelType::Eeg,
    ChannelType::Eeg,
    ChannelType::Eeg,
    ChannelType::Eeg,
    ChannelType::Eeg,
    ChannelType::Emg,
    ChannelType::Emg,
    ChannelType::Emg,
    ChannelType::Emg,
];

// Row of EEG data coming OUT of the DB. `channels` is length NUM_CHANNELS,
// ordered 0..8 = EEG, 8..12 = EMG.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EegDataRow {
    pub time: DateTime<Utc>,
    pub channels: Vec<i32>,
}

impl EegDataRow {
    pub fn validate(&self) -> Result<(), String> {
        if self.channels.len() != NUM_CHANNELS {
            return Err(format!(
                "expected {} channels, got {}",
                NUM_CHANNELS,
                self.channels.len()
            ));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn constants_are_consistent() {
        assert_eq!(NUM_CHANNELS, 12);
        assert_eq!(NUM_EEG + NUM_EMG, NUM_CHANNELS);
        assert_eq!(DEFAULT_CHANNEL_LABELS.len(), NUM_CHANNELS);
        assert_eq!(DEFAULT_CHANNEL_TYPES.len(), NUM_CHANNELS);
    }

    #[test]
    fn channel_ordering_matches_spec() {
        for (i, ch_type) in DEFAULT_CHANNEL_TYPES.iter().enumerate().take(NUM_EEG) {
            assert_eq!(*ch_type, ChannelType::Eeg, "index {} should be EEG", i);
        }
        for (i, ch_type) in DEFAULT_CHANNEL_TYPES.iter().enumerate().skip(NUM_EEG) {
            assert_eq!(*ch_type, ChannelType::Emg, "index {} should be EMG", i);
        }
    }

    #[test]
    fn validate_accepts_correct_length() {
        let row = EegDataRow {
            time: Utc::now(),
            channels: vec![0; NUM_CHANNELS],
        };
        assert!(row.validate().is_ok());
    }

    #[test]
    fn validate_rejects_wrong_length() {
        let too_few = EegDataRow {
            time: Utc::now(),
            channels: vec![0; 4],
        };
        assert!(too_few.validate().is_err());

        let too_many = EegDataRow {
            time: Utc::now(),
            channels: vec![0; 13],
        };
        assert!(too_many.validate().is_err());
    }

    #[test]
    fn channel_type_serializes_lowercase() {
        assert_eq!(serde_json::to_string(&ChannelType::Eeg).unwrap(), "\"eeg\"");
        assert_eq!(serde_json::to_string(&ChannelType::Emg).unwrap(), "\"emg\"");
    }
}

// Struct for the query parameters on GET /api/sessions/{session_id}/eeg-data
#[derive(Debug, Deserialize)]
pub struct EegDataQuery {
    pub start: DateTime<Utc>,
    pub end: DateTime<Utc>,
}
