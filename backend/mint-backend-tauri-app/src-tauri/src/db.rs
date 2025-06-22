// src/db.rs
use tokio_postgres::{NoTls, Client};
use std::sync::Arc;
use tokio::sync::Mutex as AsyncMutex;
use dotenvy::dotenv;
use chrono::{DateTime, Utc};

pub type DbClient = Arc<AsyncMutex<Client>>;

pub async fn initialize_connection() -> Result<DbClient, tokio_postgres::Error> {
    dotenv().ok();
    // let db_conn_str = env::var("DB_CONNECTION_STRING")
    //     .expect("DB_CONNECTION_STRING not found");
    let db_conn_str = "hostaddr=128.189.69.46 user=team_user password=ubcmintpw dbname=ubcmint port=5432";
    
    let (client, connection) = tokio_postgres::connect(&db_conn_str, NoTls).await?;
    
    // Spawn the connection task.
    tokio::spawn(async move {
        if let Err(e) = connection.await {
            eprintln!("PostgreSQL connection error: {}", e);
        }
    });
    
    Ok(Arc::new(AsyncMutex::new(client)))
}

pub async fn initialize_db(client: DbClient) -> Result<String, tokio_postgres::Error> {
    let client = client.lock().await;
    Ok("Database initialized".to_string())
}

pub async fn add_user(client: DbClient, name: String, email: String) -> Result<String, tokio_postgres::Error> {
    let client = client.lock().await;
    client.execute(
        "INSERT INTO users (username, email) VALUES ($1, $2)",
        &[&name, &email],
    ).await?;
    
    Ok(format!("User {} added", name))
}

pub async fn get_users(client: DbClient) -> Result<Vec<(i32, String, String)>, tokio_postgres::Error> {
    let client = client.lock().await;
    let rows = client.query("SELECT id, username, email FROM users", &[]).await?;
    
    let users = rows.iter().map(|row| {
        (row.get(0), row.get(1), row.get(2))
    }).collect();
    
    Ok(users)
}

/// Insert a new record into testtime_series using chrono's DateTime<Utc>.
pub async fn add_testtime_series_data(
    client: DbClient,
    timestamp: DateTime<Utc>,
    value: f64,
    metadata: String,
) -> Result<String, tokio_postgres::Error> {
    let client = client.lock().await;
    client.execute(
        "INSERT INTO testtime_series (timestamp, value, metadata) VALUES ($1, $2, $3)",
        &[&timestamp, &value, &metadata],
    ).await?;
    
    Ok("Time series data added successfully".to_string())
}

/// Retrieve records from testtime_series.
pub async fn get_testtime_series_data(client: DbClient) -> Result<Vec<(i32, DateTime<Utc>, f64, String)>, tokio_postgres::Error> {
    let client = client.lock().await;
    let rows = client.query("SELECT id, timestamp, value, metadata FROM testtime_series", &[]).await?;
    
    let data = rows.iter().map(|row| {
        (row.get(0), row.get(1), row.get(2), row.get(3))
    }).collect();
    
    Ok(data)
}
