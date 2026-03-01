use serde_json::{Value};
use sqlx::{
    postgres::PgPoolOptions,
    Error, PgPool,
};
use tokio::time::{self, Duration};
use log::{info, error, warn};
use chrono::{DateTime, Utc};
use dotenvy::dotenv;
use super::models::{User, NewUser, TimeSeriesData, UpdateUser, Session, FrontendState, NewTimeLabel, EegDataRow};
use crate::{lsl::EEGDataPacket};
use once_cell::sync::OnceCell;
use std::sync::Arc;
use argon2::password_hash::SaltString;
use rand_core::OsRng;
use argon2::{Argon2, password_hash::{PasswordHasher, PasswordHash, PasswordVerifier}};


use serde::{Serialize, Deserialize};

pub static DB_POOL: OnceCell<Arc<PgPool>> = OnceCell::new();

pub type DbClient = Arc<PgPool>;

// struct for EEG rows to convert to CSV
#[derive(serde::Serialize)]
struct EEGCsvRow {
    time: String,
    channel1: i32,
    channel2: i32,
    channel3: i32,
    channel4: i32,
}

pub async fn initialize_connection() -> Result<DbClient, Error> {
    dotenv().ok();
    let database_url = std::env::var("DATABASE_URL")
        .expect("DATABASE_URL must be set in the environment or .env file");

    let mut attempts = 0;
    let max_attempts = 10;
    let mut delay = 1; // seconds

    loop {
        match PgPoolOptions::new()
            .max_connections(50) // Can adjust if needed in the future
            .connect(&database_url)
            .await
        {
            Ok(pool) => {
                 let arc_pool = Arc::new(pool);

                // Set the global DB_POOL once
                if DB_POOL.set(arc_pool.clone()).is_err() {
                    warn!("DB_POOL was already initialized.");
                }
                info!("Successfully connected to the database.");
                return Ok(arc_pool);
            }
            Err(e) => {
                error!("Failed to connect to database (attempt {}/{})!: {}", attempts + 1, max_attempts, e);
                attempts += 1;
                if attempts >= max_attempts {
                    return Err(e);
                }
                warn!("Retrying database connection in {} seconds...", delay);
                time::sleep(Duration::from_secs(delay)).await;
                delay = (delay * 2).min(30); // Exponential backoff, up to 30 seconds
            }
        }
    }
}

pub fn get_db_client() -> DbClient {
    DB_POOL.get().expect("DB not initialized").clone()
}

pub async fn add_user(client: &DbClient, new_user: NewUser, password_hash: String) -> Result<User, Error> {
    info!("Adding user: {} ({})", new_user.username, new_user.email);
    let user = sqlx::query_as!(
        User,
        "INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email, password_hash",
        new_user.username,
        new_user.email,
        password_hash
    )
    .fetch_one(&**client)
    .await?;
    info!("User added successfully: {:?}", user);
    Ok(user)
}

pub async fn get_users(client: &DbClient) -> Result<Vec<User>, Error> {
    info!("Retrieving users...");
    let users = sqlx::query_as!(User, "SELECT id, username, email, password_hash FROM users")
        .fetch_all(&**client)
        .await?;
    info!("Retrieved {} users.", users.len());
    Ok(users)
}

pub async fn get_user_by_email(client: &DbClient, email: &str) -> Result<User, Error> {
    sqlx::query_as!(
        User,
        "SELECT id, username, email, password_hash FROM users WHERE email = $1",
        email
    )
    .fetch_one(&**client)
    .await
}


/// Insert a new record into testtime_series using chrono's DateTime<Utc>.
pub async fn add_testtime_series_data(
    client: &DbClient,
    timestamp: DateTime<Utc>,
    value: f64,
    metadata: String,
) -> Result<TimeSeriesData, Error> {
    info!("Adding time series data at {}: {}", timestamp, value);
    let data = sqlx::query_as!(
        TimeSeriesData,
        "INSERT INTO test_time_series (timestamp, value, metadata) VALUES ($1, $2, $3) RETURNING id, timestamp, value, metadata",
        timestamp,
        value,
        metadata
    )
    .fetch_one(&**client)
    .await?;
    info!("Time series data added successfully: {:?}", data);
    Ok(data)
}


/// Retrieve records from testtime_series.
pub async fn get_testtime_series_data(client: &DbClient) -> Result<Vec<TimeSeriesData>, Error> {
    info!("Retrieving time series data...");
    let data = sqlx::query_as!(
        TimeSeriesData,
        "SELECT id, timestamp, value, metadata FROM test_time_series"
    )
    .fetch_all(&**client)
    .await?;
    info!("Retrieved {} time series data points.", data.len());
    Ok(data)
}

/// Insert a batch of records into eeg_data.
pub async fn insert_batch_eeg(client: &DbClient, session_id: i32, packet: &EEGDataPacket) -> Result<(), sqlx::Error> {

    let n_samples = packet.timestamps.len();

      // Add validation to prevent empty inserts
    if n_samples == 0 {
        info!("Skipping insert - packet has no samples");
        return Ok(());
    }

    // Construct a single SQL insert statement
    let mut query_builder = sqlx::QueryBuilder::new(
        "INSERT INTO eeg_data (session_id, time, channel1, channel2, channel3, channel4) "
    );

    // Iterate through all data in the packet, pairing timestamp to the signal, and insert them

    query_builder.push_values(
        (0..n_samples).map(|sample_idx| {
            (
                session_id,
                &packet.timestamps[sample_idx],
                packet.signals[0][sample_idx],  // Channel 0
                packet.signals[1][sample_idx],  // Channel 1
                packet.signals[2][sample_idx],  // Channel 2
                packet.signals[3][sample_idx],  // Channel 3
            )
        }),
        |mut b, (session_id, timestamp, ch0, ch1, ch2, ch3)| {
            b.push_bind(session_id)
                .push_bind(timestamp)
                .push_bind(ch0)
                .push_bind(ch1)
                .push_bind(ch2)
                .push_bind(ch3);
        }
    );

    query_builder.build().execute(&**client).await?;
    info!("EEG packet inserted successfully - {} data", packet.timestamps.len());
    Ok(())

}

/// Update a user by id.
///
/// Returns the updated User on success.
pub async fn update_user(
    client: &DbClient,
    user_id: i32,
    updated: UpdateUser,
) -> Result<User, Error> {
    log::info!("Updating user id {}", user_id);

    // Hash password if provided
    let password_hash = if let Some(password) = &updated.password {
        let salt = SaltString::generate(&mut OsRng);
        let argon2 = Argon2::default();
        Some(
            argon2
                .hash_password(password.as_bytes(), &salt)
                .map_err(|e| {
                    log::error!("Password hashing failed: {}", e);
                    Error::RowNotFound // fallback error
                })?
                .to_string(),
        )
    } else {
        None
    };

    // Build SQL query dynamically based on which fields are Some
    let user = match (updated.username, updated.email, password_hash) {
        (Some(username), Some(email), Some(password_hash)) => {
            sqlx::query_as!(
                User,
                "UPDATE users SET username = $1, email = $2, password_hash = $3 WHERE id = $4 RETURNING id, username, email, password_hash",
                username,
                email,
                password_hash,
                user_id
            )
            .fetch_one(&**client)
            .await?
        }
        (Some(username), Some(email), None) => {
            sqlx::query_as!(
                User,
                "UPDATE users SET username = $1, email = $2 WHERE id = $3 RETURNING id, username, email, password_hash",
                username,
                email,
                user_id
            )
            .fetch_one(&**client)
            .await?
        }
        (Some(username), None, Some(password_hash)) => {
            sqlx::query_as!(
                User,
                "UPDATE users SET username = $1, password_hash = $2 WHERE id = $3 RETURNING id, username, email, password_hash",
                username,
                password_hash,
                user_id
            )
            .fetch_one(&**client)
            .await?
        }
        (None, Some(email), Some(password_hash)) => {
            sqlx::query_as!(
                User,
                "UPDATE users SET email = $1, password_hash = $2 WHERE id = $3 RETURNING id, username, email, password_hash",
                email,
                password_hash,
                user_id
            )
            .fetch_one(&**client)
            .await?
        }
        (Some(username), None, None) => {
            sqlx::query_as!(
                User,
                "UPDATE users SET username = $1 WHERE id = $2 RETURNING id, username, email, password_hash",
                username,
                user_id
            )
            .fetch_one(&**client)
            .await?
        }
        (None, Some(email), None) => {
            sqlx::query_as!(
                User,
                "UPDATE users SET email = $1 WHERE id = $2 RETURNING id, username, email, password_hash",
                email,
                user_id
            )
            .fetch_one(&**client)
            .await?
        }
        (None, None, Some(password_hash)) => {
            sqlx::query_as!(
                User,
                "UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING id, username, email, password_hash",
                password_hash,
                user_id
            )
            .fetch_one(&**client)
            .await?
        }
        (None, None, None) => {
            log::info!("No fields to update for user id {}, user not updated", user_id);
            return Err(Error::RowNotFound);
        }
    };

    log::info!("User updated: {:?}", user);
    Ok(user)
}

/// Delete a user by id.
// 
//  Returns Ok(()) if successful.
pub async fn delete_user(client: &DbClient, user_id: i32) -> Result<(), Error> {
    info!("Deleting user id {}", user_id);

    // sql query to delete user
    let _res = sqlx::query!("DELETE FROM users WHERE id = $1", user_id)
        .execute(&**client) // same thing that was done for add_user, may be incorrect
        .await?;

    // check to see if deletion was successful
    if _res.rows_affected() == 0 {
        info!("No user found with id {}, no rows deleted", user_id);
    } else {
        info!("User id {} deleted", user_id);
    }

    Ok(())
}

/// Create a new session
//
/// Returns the created Session on success.
pub async fn create_session(client: &DbClient, name: String) -> Result<Session, Error> {
    info!("Creating session: {}", name);
    let session = sqlx::query_as!(
        Session,
        "INSERT INTO sessions (name) VALUES ($1) RETURNING id, name",
        name,
    )
    .fetch_one(&**client)
    .await?;
    info!("Session created successfully: {:?}", session);
    
    return Ok(session);
}

/// Get all sessions
//
/// Returns a vector of Sessions on success.
pub async fn get_sessions(client: &DbClient) -> Result<Vec<Session>, Error>
{
    info!("Retrieving sessions...");
    let sessions = sqlx::query_as!(Session, "SELECT id, name FROM sessions")
        .fetch_all(&**client)
        .await?;
    info!("Retrieved {} sessions.", sessions.len());

    return Ok(sessions);
}

/// Delete a session by id.
//
/// Returns Ok(()) if successful.
pub async fn delete_session(client: &DbClient, session_id: i32) -> Result<(), Error> {
    info!("Deleting session id {}", session_id);

    let res = sqlx::query!("DELETE FROM sessions WHERE id = $1", session_id)
        .execute(&**client)
        .await?;

    if res.rows_affected() == 0 {
        info!("No rows deleted, session id {} not found", session_id);
        return Err(Error::RowNotFound);
    } else {
        info!("Session id {} deleted", session_id);
    }

    return Ok(());
}

/// Create a frontend_state entry tied to the given session id, which stores
/// the provided JSON data, or if a frontend_state for that session already exists,
/// update it with the new data.
///
/// Returns the created FrontendState on success.
pub async fn upsert_frontend_state(client: &DbClient, session_id: i32, data: serde_json::Value) -> Result<FrontendState, Error> {
    info!("Creating frontend state for session id {}", session_id);

    let state = sqlx::query_as!(
        FrontendState,
        "INSERT INTO frontend_state (session_id, data) VALUES ($1, $2)
        ON CONFLICT (session_id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
        RETURNING session_id, data, updated_at",
        session_id,
        data
    )
    .fetch_one(&**client)
    .await?;

    info!("Frontend state created/updated successfully: {:?}", state);

    return Ok(state);
}

/// Get the JSON frontend state associated with the given session id.
///
/// Returns the JSON value on success.
pub async fn get_frontend_state(client: &DbClient, session_id: i32) -> Result<Option<Value>, Error> {
    info!("Retrieving frontend state for session id {}", session_id);

    let state = sqlx::query_as!(
        FrontendState,
        "SELECT session_id, data, updated_at FROM frontend_state WHERE session_id = $1",
        session_id
    )
    .fetch_optional(&**client)
    .await?;

    info!("Retrieved frontend state successfully: {:?}", state);

    return Ok(state.map(|s| s.data));
}

/// Insert a batch of time labels for a given session.
///
/// Takes a session_id and a list of labels (each with a timestamp and label string),
/// and inserts them all into the time_labels table in a single query.
pub async fn insert_time_labels(client: &DbClient, session_id: i32, labels: Vec<NewTimeLabel>) -> Result<(), sqlx::Error> {
    if labels.is_empty() {
        info!("Skipping insert - no labels to insert");
        return Ok(());
    }

    let mut query_builder = sqlx::QueryBuilder::new(
        "INSERT INTO time_labels (session_id, timestamp, label) "
    );

    query_builder.push_values(labels.iter(), |mut b, label| {
        b.push_bind(session_id)
            .push_bind(label.timestamp)
            .push_bind(&label.label);
    });

    query_builder.build().execute(&**client).await?;
    info!("Inserted {} time labels for session {}", labels.len(), session_id);
    Ok(())
}

/// Get EEG data rows for a given session within a time range.
///
/// Returns all rows from eeg_data where session_id matches and time is between
/// start and end (inclusive), ordered by time.
pub async fn get_eeg_data_by_range(client: &DbClient, session_id: i32, start: DateTime<Utc>, end: DateTime<Utc>) -> Result<Vec<EegDataRow>, Error> {
    info!("Retrieving EEG data for session {} from {} to {}", session_id, start, end);

    let data = sqlx::query_as!(
        EegDataRow,
        "SELECT time, channel1, channel2, channel3, channel4 FROM eeg_data WHERE session_id = $1 AND time >= $2 AND time <= $3 ORDER BY time",
        session_id,
        start,
        end,
    )
    .fetch_all(&**client)
    .await?;

    info!("Retrieved {} EEG data rows.", data.len());
    Ok(data)
}

/// Export the EEG data for a given session ID and time range as a CSV string.
///
/// Returns the CSV data on success.
pub async fn export_eeg_data_as_csv(client: &DbClient, session_id: i32, start_time: DateTime<Utc>, end_time: DateTime<Utc>, include_header: bool) -> Result<String, Error> {
    info!("Exporting EEG data for session id {} from {} to {}", session_id, start_time, end_time);

    // get the data from the database
    let data = sqlx::query!(
        "SELECT time, channel1, channel2, channel3, channel4 FROM eeg_data
        WHERE session_id = $1 AND time >= $2 AND time <= $3
        ORDER BY time ASC",
        session_id,
        start_time,
        end_time
    )
    .fetch_all(&**client)
    .await?;

    // build the CSV using the csv crate

    let mut writer = csv::WriterBuilder::new()
        .has_headers(false)
        .from_writer(vec![]);

    // write the header based on include_header flag
    if include_header {
        writer.write_record(&["time", "channel1", "channel2", "channel3", "channel4"])
            .map_err(|e| Error::Protocol(e.to_string()))?;
    }

    // now, iterate through the data and write each row
    for row in data {
        writer.serialize(EEGCsvRow {
            time: row.time.to_rfc3339(),
            channel1: row.channel1,
            channel2: row.channel2,
            channel3: row.channel3,
            channel4: row.channel4,
        })
        .map_err(|e| Error::Protocol(e.to_string()))?;
    }

    let byte_stream = writer.into_inner()
        .map_err(|e| Error::Protocol(e.to_string()))?;

    // now, we convert the CSV data to a string and return it
    let csv_data = String::from_utf8(byte_stream)
        .map_err(|e| Error::Protocol(e.to_string()))?;

    Ok(csv_data)
}

/// Helper function for eeg data to find the earliest timestamp for a given session
///
/// Returns the earliest timestamp on success.
pub async fn get_earliest_eeg_timestamp(client: &DbClient, session_id: i32) -> Result<Option<DateTime<Utc>>, Error> {
    let row = sqlx::query!(
        "SELECT MIN(time) as earliest_time FROM eeg_data WHERE session_id = $1",
        session_id
    )
    .fetch_one(&**client)
    .await?;

    Ok(row.earliest_time)
}