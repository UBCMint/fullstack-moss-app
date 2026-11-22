use super::models::{
    EegDataRow, FrontendState, NewTimeLabel, NewUser, Session, TimeLabel, TimeSeriesData,
    UpdateUser, User,
};
use crate::channels::{CHANNEL_COLUMNS, CHANNEL_COLUMN_COUNT};
use crate::packet::EEGDataPacket;
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

/// Postgres caps one statement at 65,535 bind parameters.
const MAX_BIND_PARAMS: usize = u16::MAX as usize;
/// Binds per `eeg_data` row: session_id + time + every channel column.
const EEG_BINDS_PER_ROW: usize = 2 + CHANNEL_COLUMN_COUNT;
/// Rows per INSERT statement so a large import stays under [`MAX_BIND_PARAMS`].
const EEG_ROWS_PER_INSERT: usize = MAX_BIND_PARAMS / EEG_BINDS_PER_ROW;
// Fails the build if a future column change makes one row exceed the limit.
const _: () = assert!(EEG_ROWS_PER_INSERT > 0);

/// `time, eeg1, ..., emg4`, the column list shared by every eeg_data SELECT and INSERT.
fn eeg_columns_sql() -> String {
    std::iter::once("time")
        .chain(CHANNEL_COLUMNS)
        .collect::<Vec<_>>()
        .join(", ")
}

/// Insert one live packet into eeg_data. Channels the packet doesn't carry are stored as NULL.
pub async fn insert_batch_eeg(
    client: &DbClient,
    session_id: i32,
    packet: &EEGDataPacket,
) -> Result<(), sqlx::Error> {
    insert_eeg_rows(client, session_id, &packet.to_rows()).await?;
    Ok(())
}

/// Insert sample rows into eeg_data, skipping any `(session_id, time)` that already exists,
/// and return how many rows were actually written. Large inputs are split into several
/// statements (to respect the bind-parameter limit) that run in one transaction, so the
/// insert is all-or-nothing.
pub async fn insert_eeg_rows(
    client: &DbClient,
    session_id: i32,
    rows: &[EegDataRow],
) -> Result<u64, sqlx::Error> {
    if rows.is_empty() {
        info!("Skipping insert - no samples");
        return Ok(0);
    }

    let insert_sql = format!("INSERT INTO eeg_data (session_id, {}) ", eeg_columns_sql());
    // The transaction rolls back automatically if any chunk fails (or on drop)
    let mut tx = client.begin().await?;
    let mut rows_inserted = 0;
    for chunk in rows.chunks(EEG_ROWS_PER_INSERT) {
        let mut query_builder = sqlx::QueryBuilder::new(&insert_sql);
        query_builder.push_values(chunk, |mut b, row| {
            b.push_bind(session_id).push_bind(row.time);
            for value in row.channel_values() {
                b.push_bind(value);
            }
        });
        query_builder.push(" ON CONFLICT (session_id, time) DO NOTHING");
        rows_inserted += query_builder
            .build()
            .execute(&mut *tx)
            .await?
            .rows_affected();
    }
    tx.commit().await?;

    info!(
        "EEG rows inserted successfully - {} of {} samples were new",
        rows_inserted,
        rows.len()
    );
    Ok(rows_inserted)
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

    // Runtime query (not `query_as!`) because the column list comes from `CHANNEL_COLUMNS`.
    let sql = format!(
        "SELECT {} FROM eeg_data WHERE session_id = $1 AND time >= $2 AND time <= $3 ORDER BY time",
        eeg_columns_sql()
    );
    let data = sqlx::query_as::<_, EegDataRow>(&sql)
        .bind(session_id)
        .bind(start)
        .bind(end)
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
/// optional header `time,eeg1..eeg8,emg1..emg4`, `time` as RFC 3339, channels the
/// device didn't record as empty cells, rows sorted by time ascending. The output
/// can be re-imported as-is.
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

    let data = get_eeg_data_by_range(client, session_id, start_time, end_time).await?;
    if data.is_empty() {
        return Ok(None);
    }
    eeg_rows_to_csv(&data, include_header)
        .map(Some)
        .map_err(|e| Error::Protocol(e.to_string()))
}

/// Serializes rows as CSV: `time` (RFC 3339) then every column in `CHANNEL_COLUMNS`.
/// Channels the device didn't record (`None`) are written as empty cells.
pub fn eeg_rows_to_csv(rows: &[EegDataRow], include_header: bool) -> Result<String, csv::Error> {
    let mut writer = csv::WriterBuilder::new()
        .has_headers(false)
        .from_writer(vec![]);

    if include_header {
        writer.write_record(std::iter::once("time").chain(CHANNEL_COLUMNS))?;
    }

    for row in rows {
        let values = row
            .channel_values()
            .map(|value| value.map(|v| v.to_string()).unwrap_or_default());
        writer.write_record(std::iter::once(row.time.to_rfc3339()).chain(values))?;
    }

    let bytes = writer
        .into_inner()
        .map_err(|e| csv::Error::from(e.into_error()))?;
    Ok(String::from_utf8(bytes).expect("csv writer only emits UTF-8 from UTF-8 input"))
}

// ---------------------------------------------------------------------------
// CSV import
//
// The accepted file format is documented in docs/eeg-csv-format.md and shown to
// users in the import dialog. If you change a rule here, update both.
// ---------------------------------------------------------------------------

/// Largest CSV file accepted by the import endpoint, in bytes.
pub const MAX_IMPORT_BYTES: usize = 50 * 1024 * 1024;

/// Legacy 4-channel exports used `channel1..channel4`; they were the Muse EEG channels.
const LEGACY_CHANNEL_ALIASES: [(&str, &str); 4] = [
    ("channel1", "eeg1"),
    ("channel2", "eeg2"),
    ("channel3", "eeg3"),
    ("channel4", "eeg4"),
];

/// At most this many problems are reported back for a single file.
const MAX_REPORTED_ERRORS: usize = 10;

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

/// The accepted header names, for error messages.
fn accepted_columns_text() -> String {
    format!(
        "time, {} (legacy channel1..channel4 are read as eeg1..eeg4)",
        CHANNEL_COLUMNS.join(", ")
    )
}

/// Maps a header cell to its `CHANNEL_COLUMNS` index, accepting legacy aliases.
fn channel_column_for(name: &str) -> Option<usize> {
    let canonical = LEGACY_CHANNEL_ALIASES
        .iter()
        .find(|(alias, _)| *alias == name)
        .map_or(name, |(_, canonical)| canonical);
    CHANNEL_COLUMNS.iter().position(|c| *c == canonical)
}

/// Where each column of a validated CSV header lives.
struct CsvHeader {
    /// CSV index of the `time` column.
    time_col: usize,
    /// (CSV index, `CHANNEL_COLUMNS` index) for each channel column.
    channel_cols: Vec<(usize, usize)>,
    /// Number of columns every data row must have.
    width: usize,
}

/// Validates the header row, reporting every problem. Returns `None` if it has any.
fn parse_csv_header(
    record: &csv::StringRecord,
    line: Option<u64>,
    found: &mut ErrorCollector,
) -> Option<CsvHeader> {
    let errors_before = found.total;
    let mut time_col = None;
    let mut channel_cols: Vec<(usize, usize)> = Vec::new();
    for (csv_idx, raw) in record.iter().enumerate() {
        let name = raw.trim().to_ascii_lowercase();
        let column_label = format!("column {}", csv_idx + 1);
        if name == "time" {
            if time_col.replace(csv_idx).is_some() {
                found.report(CsvRowError::new(
                    line,
                    Some(&column_label),
                    Some(raw),
                    "the header has more than one \"time\" column.",
                ));
            }
            continue;
        }
        match channel_column_for(&name) {
            Some(column) if channel_cols.iter().any(|&(_, c)| c == column) => {
                found.report(CsvRowError::new(
                    line,
                    Some(&column_label),
                    Some(raw),
                    format!(
                        "\"{}\" appears more than once in the header.",
                        CHANNEL_COLUMNS[column]
                    ),
                ));
            }
            Some(column) => channel_cols.push((csv_idx, column)),
            None => found.report(CsvRowError::new(
                line,
                Some(&column_label),
                Some(raw),
                format!(
                    "unknown column name. Accepted columns (any letter case, any order): {}",
                    accepted_columns_text()
                ),
            )),
        }
    }

    if time_col.is_none() {
        found.report(CsvRowError::new(
            line,
            None,
            None,
            "the header has no \"time\" column.",
        ));
    }
    // Only worth saying when no column was rejected above.
    if channel_cols.is_empty() && found.total == errors_before {
        found.report(CsvRowError::new(
            line,
            None,
            None,
            format!(
                "the header has no channel columns. Accepted columns: {}",
                accepted_columns_text()
            ),
        ));
    }

    if found.total > errors_before {
        return None;
    }
    Some(CsvHeader {
        time_col: time_col?,
        channel_cols,
        width: record.len(),
    })
}

/// Parse and fully validate an EEG CSV into rows. Never touches the database, so every
/// problem in the file is found before anything is written.
///
/// Rules (keep in sync with docs/eeg-csv-format.md):
/// - UTF-8 text (a leading BOM is fine), comma-separated, optional "quotes".
/// - First line is a header. Columns are matched **by name** (any letter case, any order):
///   `time` (required) plus at least one of `eeg1..eeg8`, `emg1..emg4`. Legacy
///   `channel1..channel4` are read as `eeg1..eeg4`. Unknown or repeated columns are errors,
///   so a typo can't silently drop a channel.
/// - At least one data row; every row has one value per header column; blank lines are
///   ignored.
/// - `time`: RFC 3339 timestamp with a UTC offset, e.g. `2024-01-15T13:45:00Z`.
/// - Channels: finite numbers (decimals allowed). An empty cell means the channel wasn't
///   recorded and is stored as NULL.
/// - No two rows may share the same `time`.
pub fn parse_eeg_csv(csv_bytes: &[u8]) -> Result<Vec<EegDataRow>, EegImportError> {
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

    let mut header: Option<CsvHeader> = None;
    let mut rows: Vec<EegDataRow> = Vec::new();
    let mut seen_times: HashMap<DateTime<Utc>, u64> = HashMap::new();

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

        let Some(CsvHeader {
            time_col,
            channel_cols,
            width,
        }) = &header
        else {
            header = parse_csv_header(&record, line, &mut found);
            if header.is_none() {
                // Rows can't be interpreted reliably with a wrong header.
                break;
            }
            continue;
        };

        if record.len() != *width {
            found.report(CsvRowError::new(
                line,
                None,
                None,
                format!(
                    "this row has {} value{} but the header has {} columns. \
                     Check for missing or extra commas.",
                    record.len(),
                    if record.len() == 1 { "" } else { "s" },
                    width
                ),
            ));
            continue;
        }

        let mut row_ok = true;

        let time_raw = record.get(*time_col).unwrap_or("").trim();
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

        let mut values = [None; CHANNEL_COLUMN_COUNT];
        for &(csv_idx, column) in channel_cols {
            let raw = record.get(csv_idx).unwrap_or("").trim();
            if raw.is_empty() {
                continue; // channel not recorded for this sample
            }
            match raw.parse::<f64>() {
                Ok(v) if v.is_finite() => values[column] = Some(v),
                _ => {
                    row_ok = false;
                    found.report(CsvRowError::new(
                        line,
                        Some(CHANNEL_COLUMNS[column]),
                        Some(raw),
                        "not a number; use digits with an optional '-' and '.' \
                         (no letters, units, thousands separators, or NaN/inf). \
                         Leave the cell empty if the channel wasn't recorded",
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
                rows.push(EegDataRow::from_channel_values(t, values));
            }
        }
    }

    if found.total == 0 && rows.is_empty() {
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

    Ok(rows)
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
    let rows = parse_eeg_csv(csv_bytes)?;
    let rows_inserted = insert_eeg_rows(client, session_id, &rows).await?;
    Ok(ImportSummary {
        rows_read: rows.len(),
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
mod tests {
    use super::*;

    const FULL_HEADER: &str = "time,eeg1,eeg2,eeg3,eeg4,eeg5,eeg6,eeg7,eeg8,emg1,emg2,emg3,emg4";

    fn errs(csv: &str) -> (Vec<CsvRowError>, usize) {
        match parse_eeg_csv(csv.as_bytes()) {
            Err(EegImportError::InvalidCsv {
                errors,
                total_errors,
            }) => (errors, total_errors),
            other => panic!("expected InvalidCsv, got {:?}", other.map(|r| r.len())),
        }
    }

    #[test]
    fn eeg_columns_sql_lists_all_columns() {
        assert_eq!(eeg_columns_sql(), FULL_HEADER.replace(',', ", "));
    }

    #[test]
    fn csv_round_trip_full_layout() {
        let csv = format!(
            "{}\n2026-03-01T12:00:00+00:00,1.5,2,3,4,5,6,7,8,-9.25,10,11,12\n",
            FULL_HEADER
        );
        let rows = parse_eeg_csv(csv.as_bytes()).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].eeg1, Some(1.5));
        assert_eq!(rows[0].emg1, Some(-9.25));
        assert_eq!(rows[0].emg4, Some(12.0));
        assert_eq!(eeg_rows_to_csv(&rows, true).unwrap(), csv);
    }

    #[test]
    fn csv_missing_channels_are_empty_and_null() {
        let rows = parse_eeg_csv(b"time,eeg1,emg2\n2026-03-01T12:00:00Z,1,\n").unwrap();
        assert_eq!(rows[0].eeg1, Some(1.0));
        assert_eq!(rows[0].emg2, None);
        assert_eq!(rows[0].eeg2, None);

        let csv = eeg_rows_to_csv(&rows, false).unwrap();
        assert_eq!(csv, "2026-03-01T12:00:00+00:00,1,,,,,,,,,,,\n");
    }

    #[test]
    fn csv_accepts_legacy_headers_any_order_case_bom_and_crlf() {
        let csv = "\u{feff}channel4, Time,CHANNEL1,channel2,channel3\r\n\
                   4,2024-01-15T13:45:00Z,1,-2,3\r\n\
                   \r\n\
                   8,2024-01-15T13:45:01.5-08:00,5,6,7\r\n";
        let rows = parse_eeg_csv(csv.as_bytes()).unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!(
            (rows[0].eeg1, rows[0].eeg2, rows[0].eeg3, rows[0].eeg4),
            (Some(1.0), Some(-2.0), Some(3.0), Some(4.0))
        );
        assert_eq!(rows[0].eeg5, None);
    }

    #[test]
    fn empty_and_header_only_files() {
        assert_eq!(errs("  \n").1, 1);
        let (e, _) = errs("time,eeg1\n");
        assert!(e[0].problem.contains("no data rows"));
    }

    #[test]
    fn bad_header_is_reported_by_column() {
        // unknown column
        let (e, _) = errs("time,eeg9\n2026-03-01T12:00:00Z,1\n");
        assert_eq!(e.len(), 1);
        assert_eq!(e[0].line, Some(1));
        assert_eq!(e[0].column.as_deref(), Some("column 2"));
        assert_eq!(e[0].value.as_deref(), Some("eeg9"));
        // eeg1 given twice (once via legacy alias)
        let (e, _) = errs("time,eeg1,channel1\n2026-03-01T12:00:00Z,1,1\n");
        assert!(e[0].problem.contains("more than once"));
        // no time column
        assert!(errs("eeg1\n1\n").0[0].problem.contains("no \"time\""));
        // no channel columns
        assert!(errs("time\n2026-03-01T12:00:00Z\n").0[0]
            .problem
            .contains("no channel columns"));
    }

    #[test]
    fn bad_values_report_line_column_and_value() {
        let csv = "time,eeg1,eeg2,emg1\n\
                   2024-01-15T13:45:00Z,1,2,3\n\
                   2024-01-15 13:45:01,1,abc,NaN\n";
        let (e, total) = errs(csv);
        assert_eq!(total, 3);
        assert!(e.iter().all(|x| x.line == Some(3)));
        let cols: Vec<_> = e.iter().map(|x| x.column.clone().unwrap()).collect();
        assert_eq!(cols, ["time", "eeg2", "emg1"]);
        assert!(e[1].problem.contains("not a number"));
    }

    #[test]
    fn wrong_column_count_and_duplicates() {
        let csv = "time,eeg1,eeg2,eeg3,eeg4\n\
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
        let mut bytes = b"time,eeg1\n".to_vec();
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
        let mut csv = String::from("time,eeg1,eeg2\n");
        for i in 0..25 {
            csv.push_str(&format!("2024-01-15T13:45:{:02}Z,x,2\n", i));
        }
        let (e, total) = errs(&csv);
        assert_eq!(e.len(), MAX_REPORTED_ERRORS);
        assert_eq!(total, 25);
    }
}
