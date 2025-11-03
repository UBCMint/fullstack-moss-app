use sqlx::{
    postgres::PgPoolOptions,
    Error, PgPool,
};
use tokio::time::{self, Duration};
use log::{info, error, warn};
use chrono::{DateTime, Utc};
use dotenvy::dotenv;
use super::models::{User, NewUser, TimeSeriesData, UpdateUser};
use crate::lsl::{EEGDataPacket};
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
pub async fn insert_batch_eeg(client: &DbClient, packet: &EEGDataPacket) -> Result<(), sqlx::Error> {

    let n_samples = packet.timestamps.len();

      // Add validation to prevent empty inserts
    if n_samples == 0 {
        info!("Skipping insert - packet has no samples");
        return Ok(());
    }

    // Construct a single SQL insert statement
    let mut query_builder = sqlx::QueryBuilder::new(
        "INSERT INTO eeg_data (time, channel1, channel2, channel3, channel4) "
    );

    // Iterate through all data in the packet, pairing timestamp to the signal, and insert them

    query_builder.push_values(
        (0..n_samples).map(|sample_idx| {
            (
                &packet.timestamps[sample_idx],
                packet.signals[0][sample_idx],  // Channel 0
                packet.signals[1][sample_idx],  // Channel 1
                packet.signals[2][sample_idx],  // Channel 2
                packet.signals[3][sample_idx],  // Channel 3
            )
        }),
        |mut b, (timestamp, ch0, ch1, ch2, ch3)| {
            b.push_bind(timestamp)
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