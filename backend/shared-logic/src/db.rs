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
use serde_json::Value;
use sqlx::{postgres::PgPoolOptions, Error, PgPool};
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
    insert_eeg_rows(client, session_id, &packet.to_rows()).await
}

/// Insert sample rows into eeg_data, skipping any `(session_id, time)` that already exists.
/// Large inputs are split into several statements (to respect the bind-parameter limit) that
/// run in one transaction.
pub async fn insert_eeg_rows(
    client: &DbClient,
    session_id: i32,
    rows: &[EegDataRow],
) -> Result<(), sqlx::Error> {
    // Add validation to prevent empty inserts
    if rows.is_empty() {
        info!("Skipping insert - no samples");
        return Ok(());
    }

    let insert_sql = format!("INSERT INTO eeg_data (session_id, {}) ", eeg_columns_sql());
    // One transaction, so a multi-statement import is all-or-nothing
    let mut tx = client.begin().await?;
    for chunk in rows.chunks(EEG_ROWS_PER_INSERT) {
        let mut query_builder = sqlx::QueryBuilder::new(&insert_sql);
        query_builder.push_values(chunk, |mut b, row| {
            b.push_bind(session_id).push_bind(row.time);
            for value in row.channel_values() {
                b.push_bind(value);
            }
        });
        query_builder.push(" ON CONFLICT (session_id, time) DO NOTHING");
        query_builder.build().execute(&mut *tx).await?;
    }
    tx.commit().await?;

    info!("EEG rows inserted successfully - {} samples", rows.len());
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

    Ok(session)
}

/// Get all sessions
//
/// Returns a vector of Sessions on success.
pub async fn get_sessions(client: &DbClient) -> Result<Vec<Session>, Error> {
    info!("Retrieving sessions...");
    let sessions = sqlx::query_as!(Session, "SELECT id, name FROM sessions")
        .fetch_all(&**client)
        .await?;
    info!("Retrieved {} sessions.", sessions.len());

    Ok(sessions)
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
/// Returns the CSV data on success.
pub async fn export_eeg_data_as_csv(
    client: &DbClient,
    session_id: i32,
    start_time: DateTime<Utc>,
    end_time: DateTime<Utc>,
    include_header: bool,
) -> Result<String, Error> {
    info!(
        "Exporting EEG data for session id {} from {} to {}",
        session_id, start_time, end_time
    );

    let data = get_eeg_data_by_range(client, session_id, start_time, end_time).await?;
    eeg_rows_to_csv(&data, include_header).map_err(|e| Error::Protocol(e.to_string()))
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

/// Import EEG data from a CSV byte stream for a given session ID.
///
/// The first row must be a header. See [`parse_eeg_csv`] for the accepted columns.
pub async fn import_eeg_data_from_csv(
    client: &DbClient,
    session_id: i32,
    csv_bytes: &[u8],
) -> Result<(), Error> {
    info!("Importing EEG data for session id {} from CSV", session_id);
    let rows = parse_eeg_csv(csv_bytes).map_err(Error::Protocol)?;
    insert_eeg_rows(client, session_id, &rows).await
}

/// Legacy 4-channel exports used `channel1..channel4`; they were the Muse EEG channels.
const LEGACY_CHANNEL_ALIASES: [(&str, &str); 4] = [
    ("channel1", "eeg1"),
    ("channel2", "eeg2"),
    ("channel3", "eeg3"),
    ("channel4", "eeg4"),
];

/// Parses an EEG CSV into rows. Columns are matched **by header name** (case-insensitive,
/// any order):
///
/// - `time` (required): RFC 3339 timestamp,
/// - any subset of `eeg1..eeg8`, `emg1..emg4` (at least one),
/// - legacy `channel1..channel4`, read as `eeg1..eeg4`.
///
/// Missing columns and empty cells become `NULL`. Unknown or duplicate columns are an error,
/// so a typo can't silently drop a channel. Nothing is returned if any row is invalid.
pub fn parse_eeg_csv(csv_bytes: &[u8]) -> Result<Vec<EegDataRow>, String> {
    let mut reader = csv::ReaderBuilder::new()
        .has_headers(true)
        .trim(csv::Trim::All)
        .from_reader(csv_bytes);

    // Map each CSV column to `None` (time) or `Some(channel column index)`
    let headers = reader.headers().map_err(|e| e.to_string())?.clone();
    let mut time_col = None;
    let mut channel_cols: Vec<(usize, usize)> = Vec::new(); // (csv index, CHANNEL_COLUMNS index)
    for (csv_idx, raw_name) in headers.iter().enumerate() {
        let name = raw_name.to_ascii_lowercase();
        if name == "time" {
            if time_col.replace(csv_idx).is_some() {
                return Err("Duplicate time column".to_string());
            }
            continue;
        }
        let canonical = LEGACY_CHANNEL_ALIASES
            .iter()
            .find(|(alias, _)| *alias == name)
            .map_or(name.as_str(), |(_, canonical)| canonical);
        let Some(column) = CHANNEL_COLUMNS.iter().position(|c| *c == canonical) else {
            return Err(format!(
                "Unknown column {:?}; expected time, {} (or legacy channel1..channel4)",
                raw_name,
                CHANNEL_COLUMNS.join(", ")
            ));
        };
        if channel_cols.iter().any(|&(_, c)| c == column) {
            return Err(format!("Duplicate column for {}", CHANNEL_COLUMNS[column]));
        }
        channel_cols.push((csv_idx, column));
    }
    let time_col = time_col.ok_or("Missing time column")?;
    if channel_cols.is_empty() {
        return Err("CSV has no channel columns".to_string());
    }

    let mut rows = Vec::new();
    for (line, result) in reader.records().enumerate() {
        let record = result.map_err(|e| e.to_string())?;
        let row_number = line + 2; // 1-based, after the header
        let time_str = record
            .get(time_col)
            .ok_or_else(|| format!("Row {}: missing time field", row_number))?;
        let time = DateTime::parse_from_rfc3339(time_str)
            .map_err(|e| format!("Row {}: invalid time {:?}: {}", row_number, time_str, e))?
            .with_timezone(&Utc);

        let mut values = [None; CHANNEL_COLUMN_COUNT];
        for &(csv_idx, column) in &channel_cols {
            let cell = record.get(csv_idx).unwrap_or("");
            if cell.is_empty() {
                continue;
            }
            let value = cell.parse::<f64>().map_err(|e| {
                format!(
                    "Row {}: invalid {} value {:?}: {}",
                    row_number, CHANNEL_COLUMNS[column], cell, e
                )
            })?;
            values[column] = Some(value);
        }
        rows.push(EegDataRow::from_channel_values(time, values));
    }
    Ok(rows)
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
    fn csv_accepts_legacy_four_channel_headers_in_any_order() {
        let rows = parse_eeg_csv(
            b"channel4,Time,channel1,channel2,channel3\n4,2026-03-01T12:00:00Z,1,2,3\n",
        )
        .unwrap();
        assert_eq!(
            (rows[0].eeg1, rows[0].eeg2, rows[0].eeg3, rows[0].eeg4),
            (Some(1.0), Some(2.0), Some(3.0), Some(4.0))
        );
        assert_eq!(rows[0].eeg5, None);
    }

    #[test]
    fn csv_rejects_bad_input() {
        // unknown column
        assert!(parse_eeg_csv(b"time,eeg9\n2026-03-01T12:00:00Z,1\n").is_err());
        // eeg1 given twice (once via legacy alias)
        assert!(parse_eeg_csv(b"time,eeg1,channel1\n2026-03-01T12:00:00Z,1,1\n").is_err());
        // no time column
        assert!(parse_eeg_csv(b"eeg1\n1\n").is_err());
        // no channel columns
        assert!(parse_eeg_csv(b"time\n2026-03-01T12:00:00Z\n").is_err());
        // bad timestamp
        assert!(parse_eeg_csv(b"time,eeg1\nyesterday,1\n").is_err());
        // non-numeric value
        assert!(parse_eeg_csv(b"time,eeg1\n2026-03-01T12:00:00Z,abc\n").is_err());
    }
}
