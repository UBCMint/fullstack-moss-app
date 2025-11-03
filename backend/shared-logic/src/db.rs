use serde_json::{Value};
use sqlx::{
    postgres::PgPoolOptions,
    Error, PgPool,
};
use tokio::time::{self, Duration};
use log::{info, error, warn};
use chrono::{DateTime, Utc};
use dotenvy::dotenv;
use super::models::{User, NewUser, TimeSeriesData, UpdateUser, Session, FrontendState};
use crate::{lsl::EEGData};
use once_cell::sync::OnceCell;
use std::sync::Arc;

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

pub async fn add_user(client: &DbClient, new_user: NewUser) -> Result<User, Error> {
    info!("Adding user: {} ({})", new_user.username, new_user.email);
    let user = sqlx::query_as!(
        User,
        "INSERT INTO users (username, email) VALUES ($1, $2) RETURNING id, username, email",
        new_user.username,
        new_user.email,
    )
    .fetch_one(&**client)
    .await?;
    info!("User added successfully: {:?}", user);
    Ok(user)
}

pub async fn get_users(client: &DbClient) -> Result<Vec<User>, Error> {
    info!("Retrieving users...");
    let users = sqlx::query_as!(User, "SELECT id, username, email FROM users")
        .fetch_all(&**client)
        .await?;
    info!("Retrieved {} users.", users.len());
    Ok(users)
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
pub async fn insert_batch_eeg(client: &DbClient, batch: &[EEGData]) -> Result<(), sqlx::Error> {
    // Construct a single SQL insert statement
    let mut query_builder = sqlx::QueryBuilder::new(
        "INSERT INTO eeg_data (time, channel1, channel2, channel3, channel4) "
    );
    
    // inputting the values of the batch into the SQL insert statement
    query_builder.push_values(batch, |mut b, item| {
        b.push_bind(item.time)
            .push_bind(item.signals[0])
            .push_bind(item.signals[1])
            .push_bind(item.signals[2])
            .push_bind(item.signals[3]);
    });

    query_builder.build().execute(&**client).await?;
    info!("Batch EEG data added successfully, Size: {}", batch.len());
    Ok(())
}

/// Update a user by id.
///
/// Returns the updated User on success.
pub async fn update_user(client: &DbClient, user_id: i32, updated: UpdateUser) -> Result<User, Error> {
    info!("Updating user id {}", user_id);

    
    // see what fields are being updated
    if let Some(ref username) = updated.username {
        info!("Updating username: {}", username);
    }
    
    if let Some(ref email) = updated.email {
        info!("Updating email: {}", email);
    }

    // sql query to update user
    let user = match (updated.username, updated.email) {
        (Some(username), Some(email)) => {
            sqlx::query_as!(
                User,
                "UPDATE users SET username = $1, email = $2 WHERE id = $3 RETURNING id, username, email",
                username,
                email,
                user_id
            )
            .fetch_one(&**client) 
            .await?
        }
        (Some(username), None) => {
            sqlx::query_as!(
                User,
                "UPDATE users SET username = $1 WHERE id = $2 RETURNING id, username, email",
                username,
                user_id
            )
            .fetch_one(&**client)
            .await?
        }
        (None, Some(email)) => {
            sqlx::query_as!(
                User,
                "UPDATE users SET email = $1 WHERE id = $2 RETURNING id, username, email",
                email,
                user_id
            )
            .fetch_one(&**client)
            .await?
        }
        (None, None) => {
            info!("No fields to update for user id {}, user not updated", user_id); // unsure of what behavior to do in this case
            return Err(Error::RowNotFound); // returning error for now, should this be allowed/be a different error?
        }
    };

    /// let user = sqlx::query_as!(
    ///     User,
    ///     r#" UPDATE users SET
    ///         username = COALESCE($1, username),
    //        email = COALESCE($2, email)
    //       WHERE id = $3
    //      RETURNING id, username, email "#,
    ///     updated.username,
    ///     updated.email,
    ///     user_id
    /// )
    /// .fetch_one(&**client)
    /// .await?;

    info!("=User updated: {:?}", user);
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

    if (res.rows_affected() == 0) {
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