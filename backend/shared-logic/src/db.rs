use super::models::{
    EegDataRow, FrontendState, NewTimeLabel, NewUser, Session, TimeLabel, TimeSeriesData,
    UpdateUser, User,
};
use crate::lsl::EEGDataPacket;
use argon2::password_hash::SaltString;
use argon2::{password_hash::PasswordHasher, Argon2};
use chrono::{DateTime, Utc};
use dotenvy::dotenv;
use log::{error, info, warn};
use once_cell::sync::OnceCell;
use rand_core::OsRng;
use serde::Serialize;
use serde_json::Value;
use sqlx::{postgres::PgPoolOptions, Error, PgPool};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::time::{self, Duration};

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
                error!(
                    "Failed to connect to database (attempt {}/{})!: {}",
                    attempts + 1,
                    max_attempts,
                    e
                );
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

pub async fn add_user(
    client: &DbClient,
    new_user: NewUser,
    password_hash: String,
) -> Result<User, Error> {
    info!("Adding user: {} ({})", new_user.username, new_user.email);
    let user = sqlx::query_as!(
        User,
        "INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email, password_hash, created_at",
        new_user.username,
        new_user.email,
        password_hash
    )
    .fetch_one(&**client)
    .await?;
    info!("User added successfully: {:?}", user);
    Ok(user)
}

pub async fn get_user_by_email(client: &DbClient, email: &str) -> Result<User, Error> {
    sqlx::query_as!(
        User,
        "SELECT id, username, email, password_hash, created_at FROM users WHERE email = $1",
        email
    )
    .fetch_one(&**client)
    .await
}

pub async fn get_user_by_id(client: &DbClient, user_id: i32) -> Result<User, Error> {
    sqlx::query_as!(
        User,
        "SELECT id, username, email, password_hash, created_at FROM users WHERE id = $1",
        user_id
    )
    .fetch_one(&**client)
    .await
}

/// Updates a user's password hash directly (the caller is responsible for
/// verifying the current password first — see `change_password` in
/// api-server). Only the password changes; everything else is untouched.
pub async fn update_password(
    client: &DbClient,
    user_id: i32,
    new_password_hash: String,
) -> Result<(), Error> {
    sqlx::query!(
        "UPDATE users SET password_hash = $1 WHERE id = $2",
        new_password_hash,
        user_id
    )
    .execute(&**client)
    .await?;
    Ok(())
}

/// Create a session row for a logged-in user. Only the SHA-256 hash of the
/// session token is stored — the raw token is never persisted.
pub async fn create_auth_session(
    client: &DbClient,
    user_id: i32,
    token_hash: &str,
    expires_at: DateTime<Utc>,
) -> Result<(), Error> {
    sqlx::query!(
        "INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)",
        token_hash,
        user_id,
        expires_at
    )
    .execute(&**client)
    .await?;
    Ok(())
}

/// Returns the user id for a non-expired session, or `None` if the token is
/// unknown or has expired.
pub async fn get_auth_session_user_id(
    client: &DbClient,
    token_hash: &str,
) -> Result<Option<i32>, Error> {
    let row = sqlx::query!(
        "SELECT user_id FROM auth_sessions WHERE token_hash = $1 AND expires_at > now()",
        token_hash
    )
    .fetch_optional(&**client)
    .await?;
    Ok(row.map(|r| r.user_id))
}

/// Delete a session row (logout). Not finding a matching row is not an
/// error — the session may already be expired or already logged out.
pub async fn delete_auth_session(client: &DbClient, token_hash: &str) -> Result<(), Error> {
    sqlx::query!(
        "DELETE FROM auth_sessions WHERE token_hash = $1",
        token_hash
    )
    .execute(&**client)
    .await?;
    Ok(())
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
pub async fn insert_batch_eeg(
    client: &DbClient,
    session_id: i32,
    packet: &EEGDataPacket,
) -> Result<(), sqlx::Error> {
    insert_eeg_rows(&**client, session_id, packet).await?;
    Ok(())
}

/// Runs the batch INSERT on any executor (the pool, or a transaction) and
/// returns how many rows were actually inserted. Rows whose
/// (session_id, time) already exists are skipped.
async fn insert_eeg_rows<'e, E>(
    executor: E,
    session_id: i32,
    packet: &EEGDataPacket,
) -> Result<u64, sqlx::Error>
where
    E: sqlx::PgExecutor<'e>,
{
    let n_samples = packet.timestamps.len();

    // Add validation to prevent empty inserts
    if n_samples == 0 {
        info!("Skipping insert - packet has no samples");
        return Ok(0);
    }

    // Construct a single SQL insert statement
    let mut query_builder = sqlx::QueryBuilder::new(
        "INSERT INTO eeg_data (session_id, time, channel1, channel2, channel3, channel4) ",
    );

    // Iterate through all data in the packet, pairing timestamp to the signal, and insert them

    query_builder.push_values(
        (0..n_samples).map(|sample_idx| {
            (
                session_id,
                &packet.timestamps[sample_idx],
                packet.signals[0][sample_idx], // Channel 0
                packet.signals[1][sample_idx], // Channel 1
                packet.signals[2][sample_idx], // Channel 2
                packet.signals[3][sample_idx], // Channel 3
            )
        }),
        |mut b, (session_id, timestamp, ch0, ch1, ch2, ch3)| {
            b.push_bind(session_id)
                .push_bind(timestamp)
                .push_bind(ch0)
                .push_bind(ch1)
                .push_bind(ch2)
                .push_bind(ch3);
        },
    );

    query_builder.push(" ON CONFLICT (session_id, time) DO NOTHING");
    let result = query_builder.build().execute(executor).await?;
    info!(
        "EEG packet inserted successfully - {} of {} samples were new",
        result.rows_affected(),
        n_samples
    );
    Ok(result.rows_affected())
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
                "UPDATE users SET username = $1, email = $2, password_hash = $3 WHERE id = $4 RETURNING id, username, email, password_hash, created_at",
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
                "UPDATE users SET username = $1, email = $2 WHERE id = $3 RETURNING id, username, email, password_hash, created_at",
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
                "UPDATE users SET username = $1, password_hash = $2 WHERE id = $3 RETURNING id, username, email, password_hash, created_at",
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
                "UPDATE users SET email = $1, password_hash = $2 WHERE id = $3 RETURNING id, username, email, password_hash, created_at",
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
                "UPDATE users SET username = $1 WHERE id = $2 RETURNING id, username, email, password_hash, created_at",
                username,
                user_id
            )
            .fetch_one(&**client)
            .await?
        }
        (None, Some(email), None) => {
            sqlx::query_as!(
                User,
                "UPDATE users SET email = $1 WHERE id = $2 RETURNING id, username, email, password_hash, created_at",
                email,
                user_id
            )
            .fetch_one(&**client)
            .await?
        }
        (None, None, Some(password_hash)) => {
            sqlx::query_as!(
                User,
                "UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING id, username, email, password_hash, created_at",
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

/// Create a new session owned by the given user.
//
/// Returns the created Session on success.
pub async fn create_session(
    client: &DbClient,
    name: String,
    user_id: i32,
) -> Result<Session, Error> {
    info!("Creating session: {} for user {}", name, user_id);
    let session = sqlx::query_as!(
        Session,
        "INSERT INTO sessions (name, user_id) VALUES ($1, $2) RETURNING id, name, user_id",
        name,
        user_id,
    )
    .fetch_one(&**client)
    .await?;
    info!("Session created successfully: {:?}", session);

    Ok(session)
}

/// Get all sessions owned by the given user.
//
/// Returns a vector of Sessions on success.
pub async fn get_sessions(client: &DbClient, user_id: i32) -> Result<Vec<Session>, Error> {
    info!("Retrieving sessions for user {}...", user_id);
    let sessions = sqlx::query_as!(
        Session,
        "SELECT id, name, user_id FROM sessions WHERE user_id = $1",
        user_id
    )
    .fetch_all(&**client)
    .await?;
    info!("Retrieved {} sessions.", sessions.len());

    Ok(sessions)
}

/// Checks that `session_id` exists and is owned by `user_id`. Every
/// `/api/sessions/:session_id/...` handler calls this before touching the
/// session's data, so ownership is enforced in one place instead of being
/// repeated per handler.
///
/// Returns `Err(Error::RowNotFound)` both when the session doesn't exist and
/// when it belongs to someone else — callers map that to a 404, never a
/// 403, so a caller can't use the response to tell the two cases apart and
/// enumerate other users' session ids.
pub async fn require_session_owner(
    client: &DbClient,
    session_id: i32,
    user_id: i32,
) -> Result<(), Error> {
    let found = sqlx::query!(
        "SELECT id FROM sessions WHERE id = $1 AND user_id = $2",
        session_id,
        user_id
    )
    .fetch_optional(&**client)
    .await?;

    match found {
        Some(_) => Ok(()),
        None => Err(Error::RowNotFound),
    }
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

    Ok(())
}

/// Create a frontend_state entry tied to the given session id, which stores
/// the provided JSON data, or if a frontend_state for that session already exists,
/// update it with the new data.
///
/// Returns the created FrontendState on success.
pub async fn upsert_frontend_state(
    client: &DbClient,
    session_id: i32,
    data: serde_json::Value,
) -> Result<FrontendState, Error> {
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

    Ok(state)
}

/// Get the JSON frontend state associated with the given session id.
///
/// Returns the JSON value on success.
pub async fn get_frontend_state(
    client: &DbClient,
    session_id: i32,
) -> Result<Option<Value>, Error> {
    info!("Retrieving frontend state for session id {}", session_id);

    let state = sqlx::query_as!(
        FrontendState,
        "SELECT session_id, data, updated_at FROM frontend_state WHERE session_id = $1",
        session_id
    )
    .fetch_optional(&**client)
    .await?;

    info!("Retrieved frontend state successfully: {:?}", state);

    Ok(state.map(|s| s.data))
}

/// Insert a batch of time labels for a given session.
///
/// Takes a session_id and a list of labels (each with a timestamp and label string),
/// and inserts them all into the time_labels table in a single query.
pub async fn insert_time_labels(
    client: &DbClient,
    session_id: i32,
    labels: Vec<NewTimeLabel>,
) -> Result<(), sqlx::Error> {
    if labels.is_empty() {
        info!("Skipping insert - no labels to insert");
        return Ok(());
    }

    let mut query_builder = sqlx::QueryBuilder::new(
        "INSERT INTO time_labels (session_id, start_timestamp, end_timestamp, label, color) ",
    );

    query_builder.push_values(labels.iter(), |mut b, label| {
        b.push_bind(session_id)
            .push_bind(label.start_timestamp)
            .push_bind(label.end_timestamp)
            .push_bind(&label.label)
            .push_bind(&label.color);
    });

    query_builder.build().execute(&**client).await?;
    info!(
        "Inserted {} time labels for session {}",
        labels.len(),
        session_id
    );
    Ok(())
}

/// Get EEG data rows for a given session within a time range.
///
/// Returns all rows from eeg_data where session_id matches and time is between
/// start and end (inclusive), ordered by time.
pub async fn get_eeg_data_by_range(
    client: &DbClient,
    session_id: i32,
    start: DateTime<Utc>,
    end: DateTime<Utc>,
) -> Result<Vec<EegDataRow>, Error> {
    info!(
        "Retrieving EEG data for session {} from {} to {}",
        session_id, start, end
    );

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

/// Get time labels for a given session within a time range.
///
/// Returns all rows from time_labels where session_id matches and timestamp is between
/// start and end (inclusive), ordered by timestamp.
pub async fn get_time_labels_by_range(
    client: &DbClient,
    session_id: i32,
    start: DateTime<Utc>,
    end: DateTime<Utc>,
) -> Result<Vec<TimeLabel>, Error> {
    info!(
        "Retrieving time labels for session {} from {} to {}",
        session_id, start, end
    );

    let labels = sqlx::query_as!(
        TimeLabel,
        "SELECT id, session_id, start_timestamp, end_timestamp, label, color FROM time_labels WHERE session_id = $1 AND start_timestamp >= $2 AND start_timestamp <= $3 ORDER BY start_timestamp",
        session_id,
        start,
        end,
    )
    .fetch_all(&**client)
    .await?;

    info!("Retrieved {} time labels.", labels.len());
    Ok(labels)
}

/// Export the EEG data for a given session ID and time range as a CSV string.
///
/// Output format (documented in docs/eeg-csv-format.md): UTF-8, comma-separated,
/// optional header `time,channel1,channel2,channel3,channel4`, `time` as RFC 3339,
/// channels as whole numbers, rows sorted by time ascending. The output can be
/// re-imported as-is.
///
/// Returns `Ok(None)` when the session has no data in the requested range.
pub async fn export_eeg_data_as_csv(
    client: &DbClient,
    session_id: i32,
    start_time: DateTime<Utc>,
    end_time: DateTime<Utc>,
    include_header: bool,
) -> Result<Option<String>, Error> {
    info!(
        "Exporting EEG data for session id {} from {} to {}",
        session_id, start_time, end_time
    );

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

    if data.is_empty() {
        return Ok(None);
    }

    // build the CSV using the csv crate

    let mut writer = csv::WriterBuilder::new()
        .has_headers(false)
        .from_writer(vec![]);

    // write the header based on include_header flag
    if include_header {
        writer
            .write_record(["time", "channel1", "channel2", "channel3", "channel4"])
            .map_err(|e| Error::Protocol(e.to_string()))?;
    }

    // now, iterate through the data and write each row
    for row in data {
        writer
            .serialize(EEGCsvRow {
                time: row.time.to_rfc3339(),
                channel1: row.channel1,
                channel2: row.channel2,
                channel3: row.channel3,
                channel4: row.channel4,
            })
            .map_err(|e| Error::Protocol(e.to_string()))?;
    }

    let byte_stream = writer
        .into_inner()
        .map_err(|e| Error::Protocol(e.to_string()))?;

    // now, we convert the CSV data to a string and return it
    let csv_data = String::from_utf8(byte_stream).map_err(|e| Error::Protocol(e.to_string()))?;

    Ok(Some(csv_data))
}

// ---------------------------------------------------------------------------
// CSV import
//
// The accepted file format is documented in docs/eeg-csv-format.md and shown to
// users in the import dialog. If you change a rule here, update both.
// ---------------------------------------------------------------------------

/// Largest CSV file accepted by the import endpoint, in bytes.
pub const MAX_IMPORT_BYTES: usize = 50 * 1024 * 1024;

/// Columns every imported CSV must have, in this exact order (names are
/// case-insensitive; surrounding spaces are ignored).
pub const EEG_CSV_COLUMNS: [&str; 5] = ["time", "channel1", "channel2", "channel3", "channel4"];

/// At most this many problems are reported back for a single file.
const MAX_REPORTED_ERRORS: usize = 10;

/// Rows per INSERT. Postgres allows 65,535 bind parameters per statement and
/// each row binds 6, so a single statement cannot hold more than ~10,900 rows.
const INSERT_CHUNK_ROWS: usize = 5_000;

/// One problem found in an uploaded CSV, located as precisely as possible.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct CsvRowError {
    /// 1-based line number in the file (the header is line 1).
    pub line: Option<u64>,
    /// Column name, when the problem is in a specific column.
    pub column: Option<String>,
    /// The offending value exactly as it appears in the file (truncated).
    pub value: Option<String>,
    /// Human-readable explanation of what is wrong and what is accepted.
    pub problem: String,
}

impl CsvRowError {
    fn new(
        line: Option<u64>,
        column: Option<&str>,
        value: Option<&str>,
        problem: impl Into<String>,
    ) -> Self {
        Self {
            line,
            column: column.map(str::to_string),
            value: value.map(truncate_for_display),
            problem: problem.into(),
        }
    }
}

impl std::fmt::Display for CsvRowError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        if let Some(line) = self.line {
            write!(f, "line {}", line)?;
        }
        if let Some(column) = &self.column {
            write!(f, ", column '{}'", column)?;
        }
        if let Some(value) = &self.value {
            write!(f, ", value \"{}\"", value)?;
        }
        write!(f, ": {}", self.problem)
    }
}

/// Why an import failed.
#[derive(Debug)]
pub enum EegImportError {
    /// The file does not meet the CSV format rules. Safe to show to the user.
    InvalidCsv {
        /// The first problems found (at most `MAX_REPORTED_ERRORS`).
        errors: Vec<CsvRowError>,
        /// Total number of problems found, including the ones not listed.
        total_errors: usize,
    },
    /// The file was fine but saving it failed.
    Database(Error),
}

impl EegImportError {
    fn single(problem: impl Into<String>) -> Self {
        Self::InvalidCsv {
            errors: vec![CsvRowError::new(None, None, None, problem)],
            total_errors: 1,
        }
    }

    /// One-sentence summary suitable for a toast or error message.
    pub fn summary(&self) -> String {
        match self {
            Self::InvalidCsv {
                errors,
                total_errors,
            } => match errors.as_slice() {
                [only] if *total_errors == 1 && only.line.is_none() => only.problem.clone(),
                _ => format!(
                    "The CSV file has {} problem{}; nothing was imported. Fix the rows below and try again.",
                    total_errors,
                    if *total_errors == 1 { "" } else { "s" }
                ),
            },
            Self::Database(_) => {
                "The file is valid but could not be saved to the database. Please try again."
                    .to_string()
            }
        }
    }
}

impl std::fmt::Display for EegImportError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidCsv {
                errors,
                total_errors,
            } => {
                write!(f, "{}", self.summary())?;
                for e in errors {
                    write!(f, "\n  - {}", e)?;
                }
                if total_errors > &errors.len() {
                    write!(f, "\n  - ...and {} more", total_errors - errors.len())?;
                }
                Ok(())
            }
            Self::Database(e) => write!(f, "database error: {}", e),
        }
    }
}

impl std::error::Error for EegImportError {}

impl From<Error> for EegImportError {
    fn from(e: Error) -> Self {
        Self::Database(e)
    }
}

#[derive(Default)]
struct ErrorCollector {
    errors: Vec<CsvRowError>,
    total: usize,
}

impl ErrorCollector {
    fn report(&mut self, err: CsvRowError) {
        self.total += 1;
        if self.errors.len() < MAX_REPORTED_ERRORS {
            self.errors.push(err);
        }
    }
}

fn truncate_for_display(s: &str) -> String {
    const MAX_CHARS: usize = 40;
    if s.chars().count() > MAX_CHARS {
        let head: String = s.chars().take(MAX_CHARS).collect();
        format!("{}…", head)
    } else {
        s.to_string()
    }
}

/// Explain why `raw` is not an acceptable channel value.
fn describe_bad_channel_value(raw: &str) -> String {
    if raw.is_empty() {
        return "value is empty; every row needs a whole number in this column".to_string();
    }
    match raw.parse::<f64>() {
        Ok(n) if n.is_finite() => {
            if n.abs() > i32::MAX as f64 {
                format!(
                    "value is out of range; must be between {} and {}",
                    i32::MIN,
                    i32::MAX
                )
            } else if n.fract() != 0.0 {
                "decimals are not allowed; use a whole number (e.g. 42, not 42.5)".to_string()
            } else {
                "write it as a plain whole number (e.g. 1000, not 1e3 or 1000.0)".to_string()
            }
        }
        _ => "not a number; only digits with an optional leading '-' are allowed \
              (no letters, units, spaces, thousands separators, or NaN/inf)"
            .to_string(),
    }
}

/// Parse and fully validate an EEG CSV. Never touches the database, so every
/// problem in the file is found before anything is written.
///
/// Rules (keep in sync with docs/eeg-csv-format.md):
/// - UTF-8 text (a leading BOM is fine), comma-separated, optional "quotes".
/// - First line is a header: `time,channel1,channel2,channel3,channel4`
///   (any letter case, in that order, exactly 5 columns).
/// - At least one data row; every row has exactly 5 values; blank lines are ignored.
/// - `time`: RFC 3339 timestamp with a UTC offset, e.g. `2024-01-15T13:45:00Z`.
/// - `channel1..4`: whole numbers between -2,147,483,648 and 2,147,483,647.
/// - No two rows may share the same `time`.
pub fn parse_eeg_csv(csv_bytes: &[u8]) -> Result<EEGDataPacket, EegImportError> {
    let csv_bytes = csv_bytes
        .strip_prefix(&[0xEF, 0xBB, 0xBF][..])
        .unwrap_or(csv_bytes);

    if csv_bytes.iter().all(|b| b.is_ascii_whitespace()) {
        return Err(EegImportError::single(
            "The file is empty. Expected a header line followed by data rows.",
        ));
    }

    if let Err(e) = std::str::from_utf8(csv_bytes) {
        let line = csv_bytes[..e.valid_up_to()]
            .iter()
            .filter(|b| **b == b'\n')
            .count() as u64
            + 1;
        return Err(EegImportError::InvalidCsv {
            errors: vec![CsvRowError::new(
                Some(line),
                None,
                None,
                "the file contains characters that are not valid UTF-8. \
                 Re-save it as \"CSV UTF-8\" (or plain text) and try again.",
            )],
            total_errors: 1,
        });
    }

    let mut reader = csv::ReaderBuilder::new()
        .has_headers(false) // we validate the header ourselves for better messages
        .flexible(true) // we check field counts ourselves for better messages
        .from_reader(csv_bytes);

    let mut found = ErrorCollector::default();

    let mut timestamps: Vec<DateTime<Utc>> = Vec::new();
    let mut channels: [Vec<i32>; 4] = Default::default();
    let mut seen_times: HashMap<DateTime<Utc>, u64> = HashMap::new();
    let mut saw_header = false;

    for result in reader.records() {
        let record = match result {
            Ok(r) => r,
            Err(e) => {
                let line = e.position().map(|p| p.line());
                found.report(CsvRowError::new(
                    line,
                    None,
                    None,
                    format!("could not read this line as CSV ({}).", e),
                ));
                continue;
            }
        };
        let line = record.position().map(|p| p.line());

        if !saw_header {
            saw_header = true;
            if record.len() != EEG_CSV_COLUMNS.len() {
                found.report(CsvRowError::new(
                    line,
                    None,
                    None,
                    format!(
                        "the header has {} column{} but exactly {} are required, in this order: {}",
                        record.len(),
                        if record.len() == 1 { "" } else { "s" },
                        EEG_CSV_COLUMNS.len(),
                        EEG_CSV_COLUMNS.join(",")
                    ),
                ));
            } else {
                for (i, expected) in EEG_CSV_COLUMNS.iter().enumerate() {
                    let actual = record.get(i).unwrap_or("");
                    if !actual.trim().eq_ignore_ascii_case(expected) {
                        found.report(CsvRowError::new(
                            line,
                            Some(format!("column {}", i + 1).as_str()),
                            Some(actual),
                            format!(
                                "the header's column {} must be \"{}\" (any letter case). \
                                 Required header: {}",
                                i + 1,
                                expected,
                                EEG_CSV_COLUMNS.join(",")
                            ),
                        ));
                    }
                }
            }
            if found.total > 0 {
                // Rows can't be interpreted reliably with a wrong header.
                break;
            }
            continue;
        }

        if record.len() != EEG_CSV_COLUMNS.len() {
            found.report(CsvRowError::new(
                line,
                None,
                None,
                format!(
                    "this row has {} value{} but exactly {} are required ({}). \
                     Check for missing or extra commas.",
                    record.len(),
                    if record.len() == 1 { "" } else { "s" },
                    EEG_CSV_COLUMNS.len(),
                    EEG_CSV_COLUMNS.join(",")
                ),
            ));
            continue;
        }

        let mut row_ok = true;

        let time_raw = record.get(0).unwrap_or("").trim();
        let time = match DateTime::parse_from_rfc3339(time_raw) {
            Ok(t) => Some(t.with_timezone(&Utc)),
            Err(_) => {
                row_ok = false;
                let problem = if time_raw.is_empty() {
                    "value is empty; every row needs a timestamp".to_string()
                } else {
                    "not a valid RFC 3339 timestamp. Use the form 2024-01-15T13:45:00Z \
                     (or 2024-01-15T13:45:00.250-08:00); a date, a time zone offset \
                     (Z or ±hh:mm), and a 'T' between date and time are all required"
                        .to_string()
                };
                found.report(CsvRowError::new(
                    line,
                    Some("time"),
                    Some(time_raw),
                    problem,
                ));
                None
            }
        };

        let mut values = [0i32; 4];
        for (ch, slot) in values.iter_mut().enumerate() {
            let raw = record.get(ch + 1).unwrap_or("").trim();
            match raw.parse::<i32>() {
                Ok(v) => *slot = v,
                Err(_) => {
                    row_ok = false;
                    found.report(CsvRowError::new(
                        line,
                        Some(EEG_CSV_COLUMNS[ch + 1]),
                        Some(raw),
                        describe_bad_channel_value(raw),
                    ));
                }
            }
        }

        if let Some(t) = time {
            if let Some(first_line) = seen_times.get(&t).copied() {
                row_ok = false;
                found.report(CsvRowError::new(
                    line,
                    Some("time"),
                    Some(time_raw),
                    format!(
                        "duplicate timestamp; the same time already appears on line {}. \
                         Each row must have a unique time.",
                        first_line
                    ),
                ));
            } else if let Some(l) = line {
                seen_times.insert(t, l);
            }
        }

        if row_ok {
            if let Some(t) = time {
                timestamps.push(t);
                for (ch, v) in values.iter().enumerate() {
                    channels[ch].push(*v);
                }
            }
        }
    }

    if found.total == 0 && timestamps.is_empty() {
        found.report(CsvRowError::new(
            None,
            None,
            None,
            "the file has a header but no data rows.",
        ));
    }

    if found.total > 0 {
        return Err(EegImportError::InvalidCsv {
            errors: found.errors,
            total_errors: found.total,
        });
    }

    let [c1, c2, c3, c4] = channels;
    Ok(EEGDataPacket {
        timestamps,
        signals: vec![
            c1.into_iter().map(f64::from).collect(),
            c2.into_iter().map(f64::from).collect(),
            c3.into_iter().map(f64::from).collect(),
            c4.into_iter().map(f64::from).collect(),
        ],
        ml_result: None,
        quality: Vec::new(),
    })
}

/// Outcome of a successful import.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct ImportSummary {
    /// Data rows read from the file.
    pub rows_read: usize,
    /// Rows actually written; the rest already existed in the session.
    pub rows_inserted: u64,
}

/// Validate and import an EEG CSV for `session_id`. See `parse_eeg_csv` for the
/// accepted format. The file is validated completely before anything is
/// written, and all inserts run in one transaction, so a file is either
/// imported in full or not at all.
///
/// Rows whose `time` already exists in the session are skipped (existing data
/// is never overwritten); `ImportSummary` reports how many were skipped.
pub async fn import_eeg_data_from_csv(
    client: &DbClient,
    session_id: i32,
    csv_bytes: &[u8],
) -> Result<ImportSummary, EegImportError> {
    info!("Importing EEG data for session id {} from CSV", session_id);

    let packet = parse_eeg_csv(csv_bytes)?;
    let n_rows = packet.timestamps.len();

    // Insert in chunks to stay under Postgres' bind-parameter limit. The
    // transaction rolls back automatically if any chunk fails (or on drop).
    let mut tx = client.begin().await?;
    let mut rows_inserted = 0;
    for start in (0..n_rows).step_by(INSERT_CHUNK_ROWS) {
        let end = (start + INSERT_CHUNK_ROWS).min(n_rows);
        let chunk = EEGDataPacket {
            timestamps: packet.timestamps[start..end].to_vec(),
            signals: packet
                .signals
                .iter()
                .map(|c| c[start..end].to_vec())
                .collect(),
            ml_result: None,
            quality: Vec::new(),
        };
        rows_inserted += insert_eeg_rows(&mut *tx, session_id, &chunk).await?;
    }
    tx.commit().await?;

    Ok(ImportSummary {
        rows_read: n_rows,
        rows_inserted,
    })
}

/// Helper function for eeg data to find the earliest timestamp for a given session
///
/// Returns the earliest timestamp on success.
pub async fn get_earliest_eeg_timestamp(
    client: &DbClient,
    session_id: i32,
) -> Result<Option<DateTime<Utc>>, Error> {
    let row = sqlx::query!(
        "SELECT MIN(time) as earliest_time FROM eeg_data WHERE session_id = $1",
        session_id
    )
    .fetch_one(&**client)
    .await?;

    Ok(row.earliest_time)
}

#[cfg(test)]
mod csv_import_tests {
    use super::*;

    fn errs(csv: &str) -> (Vec<CsvRowError>, usize) {
        match parse_eeg_csv(csv.as_bytes()) {
            Err(EegImportError::InvalidCsv {
                errors,
                total_errors,
            }) => (errors, total_errors),
            other => panic!(
                "expected InvalidCsv, got {:?}",
                other.map(|p| p.timestamps.len())
            ),
        }
    }

    #[test]
    fn accepts_valid_file_any_header_case_bom_and_crlf() {
        let csv = "\u{feff}Time, Channel1,CHANNEL2,channel3,channel4\r\n\
                   2024-01-15T13:45:00Z,1,-2,3,4\r\n\
                   \r\n\
                   2024-01-15T13:45:01.5-08:00,5,6,7,8\r\n";
        let p = parse_eeg_csv(csv.as_bytes()).unwrap();
        assert_eq!(p.timestamps.len(), 2);
        assert_eq!(p.signals[1], vec![-2.0, 6.0]);
    }

    #[test]
    fn exported_format_round_trips() {
        let csv = "time,channel1,channel2,channel3,channel4\n\
                   2024-01-15T13:45:00+00:00,1,2,3,4\n";
        assert!(parse_eeg_csv(csv.as_bytes()).is_ok());
    }

    #[test]
    fn empty_and_header_only_files() {
        assert_eq!(errs("  \n").1, 1);
        let (e, _) = errs("time,channel1,channel2,channel3,channel4\n");
        assert!(e[0].problem.contains("no data rows"));
    }

    #[test]
    fn wrong_header_is_reported_by_column() {
        let (e, _) = errs("time,ch1,channel2,channel3,channel4\n2024-01-15T13:45:00Z,1,2,3,4\n");
        assert_eq!(e.len(), 1);
        assert_eq!(e[0].line, Some(1));
        assert_eq!(e[0].column.as_deref(), Some("column 2"));
        assert_eq!(e[0].value.as_deref(), Some("ch1"));
    }

    #[test]
    fn bad_values_report_line_column_and_value() {
        let csv = "time,channel1,channel2,channel3,channel4\n\
                   2024-01-15T13:45:00Z,1,2,3,4\n\
                   2024-01-15 13:45:01,1,12.5,abc,99999999999\n";
        let (e, total) = errs(csv);
        assert_eq!(total, 4);
        assert!(e.iter().all(|x| x.line == Some(3)));
        let cols: Vec<_> = e.iter().map(|x| x.column.clone().unwrap()).collect();
        assert_eq!(cols, ["time", "channel2", "channel3", "channel4"]);
        assert!(e[1].problem.contains("decimals"));
        assert!(e[2].problem.contains("not a number"));
        assert!(e[3].problem.contains("out of range"));
    }

    #[test]
    fn wrong_column_count_and_duplicates() {
        let csv = "time,channel1,channel2,channel3,channel4\n\
                   2024-01-15T13:45:00Z,1,2,3\n\
                   2024-01-15T13:45:01Z,1,2,3,4\n\
                   2024-01-15T13:45:01Z,1,2,3,4\n";
        let (e, total) = errs(csv);
        assert_eq!(total, 2);
        assert_eq!(e[0].line, Some(2));
        assert!(e[0].problem.contains("4 values"));
        assert_eq!(e[1].line, Some(4));
        assert!(e[1].problem.contains("line 3"));
    }

    #[test]
    fn invalid_utf8_reports_line() {
        let mut bytes = b"time,channel1,channel2,channel3,channel4\n".to_vec();
        bytes.extend_from_slice(&[0xFF, 0xFE, b'\n']);
        match parse_eeg_csv(&bytes) {
            Err(EegImportError::InvalidCsv { errors, .. }) => {
                assert_eq!(errors[0].line, Some(2));
                assert!(errors[0].problem.contains("UTF-8"));
            }
            _ => panic!("expected InvalidCsv"),
        }
    }

    #[test]
    fn caps_reported_errors_but_counts_all() {
        let mut csv = String::from("time,channel1,channel2,channel3,channel4\n");
        for i in 0..25 {
            csv.push_str(&format!("2024-01-15T13:45:{:02}Z,x,2,3,4\n", i));
        }
        let (e, total) = errs(&csv);
        assert_eq!(e.len(), MAX_REPORTED_ERRORS);
        assert_eq!(total, 25);
    }
}
