use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};
use serde_json::Value;

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

// Struct for updating a user (partial updates allowed)
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct UpdateUser { // the fields are optional, allowing you to update them individually if needed
    pub username: Option<String>,
    pub email: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct TimeSeriesData {
    pub id: i32,
    pub timestamp: DateTime<Utc>,
    pub value: f64,
    pub metadata: Option<String>,
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