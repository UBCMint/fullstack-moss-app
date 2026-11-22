use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use serde_json::Value;

use crate::channels::CHANNEL_COLUMN_COUNT;

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

// One sample row of `eeg_data` (in and out of the DB). A `None` channel is one the recording
// device doesn't have. Field order matches `channels::CHANNEL_COLUMNS`.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, sqlx::FromRow)]
pub struct EegDataRow {
    pub time: DateTime<Utc>,
    pub eeg1: Option<f64>,
    pub eeg2: Option<f64>,
    pub eeg3: Option<f64>,
    pub eeg4: Option<f64>,
    pub eeg5: Option<f64>,
    pub eeg6: Option<f64>,
    pub eeg7: Option<f64>,
    pub eeg8: Option<f64>,
    pub emg1: Option<f64>,
    pub emg2: Option<f64>,
    pub emg3: Option<f64>,
    pub emg4: Option<f64>,
}

impl EegDataRow {
    /// Channel values in `CHANNEL_COLUMNS` order.
    pub fn channel_values(&self) -> [Option<f64>; CHANNEL_COLUMN_COUNT] {
        [
            self.eeg1, self.eeg2, self.eeg3, self.eeg4, self.eeg5, self.eeg6, self.eeg7, self.eeg8,
            self.emg1, self.emg2, self.emg3, self.emg4,
        ]
    }

    /// Inverse of [`channel_values`](Self::channel_values).
    pub fn from_channel_values(
        time: DateTime<Utc>,
        values: [Option<f64>; CHANNEL_COLUMN_COUNT],
    ) -> Self {
        let [eeg1, eeg2, eeg3, eeg4, eeg5, eeg6, eeg7, eeg8, emg1, emg2, emg3, emg4] = values;
        Self {
            time,
            eeg1,
            eeg2,
            eeg3,
            eeg4,
            eeg5,
            eeg6,
            eeg7,
            eeg8,
            emg1,
            emg2,
            emg3,
            emg4,
        }
    }
}

// Struct for the query parameters on GET /api/sessions/{session_id}/eeg-data
#[derive(Debug, Deserialize)]
pub struct EegDataQuery {
    pub start: DateTime<Utc>,
    pub end: DateTime<Utc>,
}
