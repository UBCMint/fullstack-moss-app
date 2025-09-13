use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};

// Existing User struct (used for data coming OUT of the DB)
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, sqlx::FromRow)]
pub struct User {
    pub id: i32,
    pub username: String,
    pub email: String,
}

// Struct for creating a user (used for data coming INTO the API)
// Because User derived Deserialize, the serde library (which Axum used to process incoming JSON request body)
// expected all fields in User struct to be present in JSON you sent (id was not part of payload)
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct NewUser {
    pub username: String,
    pub email: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct TimeSeriesData {
    pub id: i32,
    pub timestamp: DateTime<Utc>,
    pub value: f64,
    pub metadata: Option<String>,
}
