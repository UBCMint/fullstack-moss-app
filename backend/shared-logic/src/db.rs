use sqlx::{
    postgres::PgPoolOptions,
    Error, PgPool,
};
use tokio::time::{self, Duration};
use log::{info, error, warn};
use chrono::{DateTime, Utc};
use dotenvy::dotenv;
use super::models::{User, NewUser, TimeSeriesData, UpdateUser};
use crate::lsl::{EEGData};
use once_cell::sync::OnceCell;
use std::sync::Arc;
use argon2::password_hash::SaltString;
use rand_core::OsRng;
use argon2::{Argon2, password_hash::{PasswordHasher, PasswordHash, PasswordVerifier}};



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