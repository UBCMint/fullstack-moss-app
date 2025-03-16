use rusqlite::{params, Connection, Result};
use std::sync::Mutex;
use tokio_postgres::{NoTls, Client};
use std::sync::Arc;
use tokio::sync::Mutex as AsyncMutex;
use dotenvy::dotenv;
use std::env;

pub type DbClient = Arc<AsyncMutex<Client>>;

pub async fn initialize_connection() -> Result<DbClient, tokio_postgres::Error> {
    dotenv().ok();
    let db_conn_str = env::var("DB_CONNECTION_STRING").expect("DB_CONNECTION_STRING not found");
    let conn_str = db_conn_str;
    let (client, connection) = tokio_postgres::connect(conn_str, NoTls).await?;
    
    // Spawn the connection object to run in the background.
    tokio::spawn(async move {
        if let Err(e) = connection.await {
            eprintln!("PostgreSQL connection error: {}", e);
        }
    });
    
    Ok(Arc::new(AsyncMutex::new(client)))
}

// test for timescale
pub async fn initialize_db(client: DbClient) -> Result<String, tokio_postgres::Error> {
    let mut client = client.lock().await;
    
    // Create test users table
    client.execute(
        "CREATE TABLE IF NOT EXISTS testusers (
            id SERIAL PRIMARY KEY,
            username TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE
        )",
        &[],
    ).await?;
    
    // Create test time series table
    client.execute(
        "CREATE TABLE IF NOT EXISTS testtime_series (
            id SERIAL PRIMARY KEY,
            timestamp TIMESTAMPTZ NOT NULL,
            value REAL NOT NULL,
            metadata TEXT
        )",
        &[],
    ).await?;
    
    // Convert testtime_series table to a hypertable (TimescaleDB-specific)
    client.execute(
        "SELECT create_hypertable('testtime_series', 'timestamp', if_not_exists => TRUE);",
        &[],
    ).await?;
    
    Ok("Database initialized".to_string())
}

pub async fn add_user(client: DbClient, name: String, email: String) -> Result<String, tokio_postgres::Error> {
    let mut client = client.lock().await;
    client.execute(
        "INSERT INTO users (name, email) VALUES ($1, $2)",
        &[&name, &email],
    ).await?;
    
    Ok(format!("User {} added", name))
}

pub async fn get_users(client: DbClient) -> Result<Vec<(i32, String, String)>, tokio_postgres::Error> {
    let mut client = client.lock().await;
    let rows = client.query("SELECT id, username, email FROM users", &[]).await?;
    
    let users = rows.iter().map(|row| {
        (row.get(0), row.get(1), row.get(2))
    }).collect();
    
    Ok(users)
}

pub async fn add_testtime_series_data(
    client: DbClient,
    timestamp: chrono::DateTime<chrono::Utc>,
    value: f64,
    metadata: String,
) -> Result<String, tokio_postgres::Error> {
    let mut client = client.lock().await;
    client.execute(
        "INSERT INTO testtime_series (timestamp, value, metadata) VALUES ($1, $2, $3)",
        &[&timestamp, &value, &metadata],
    ).await?;
    
    Ok("Time series data added successfully".to_string())
}

pub async fn get_testtime_series_data(client: DbClient) -> Result<Vec<(i32, chrono::DateTime<chrono::Utc>, f64, String)>, tokio_postgres::Error> {
    let mut client = client.lock().await;
    let rows = client.query("SELECT id, timestamp, value, metadata FROM testtime_series", &[]).await?;
    
    let data = rows.iter().map(|row| {
        (row.get(0), row.get(1), row.get(2), row.get(3))
    }).collect();
    
    Ok(data)
}






// // shared state for db connection
// pub struct AppState {
//     pub conn: Mutex<Connection>,
// }

// pub fn initialize_connection() -> Result<Connection> {
//     Connection::open("app.db")
// }

// #[tauri::command]
// pub fn initialize_db(state: tauri::State<AppState>) -> Result<String, String> {
//     let conn = state.conn.lock().unwrap();

//     // users table
//     conn.execute(
//         "CREATE TABLE IF NOT EXISTS users (
//             id INTEGER PRIMARY KEY AUTOINCREMENT,
//             name TEXT NOT NULL,
//             email TEXT NOT NULL UNIQUE
//         )",
//         [],
//     )
//     .map_err(|e| e.to_string())?;

//     // time series table
//     conn.execute(
//         "CREATE TABLE IF NOT EXISTS time_series (
//             id INTEGER PRIMARY KEY AUTOINCREMENT,
//             timestamp TEXT NOT NULL,
//             value REAL NOT NULL,
//             metadata TEXT
//         )",
//         [],
//     )
//     .map_err(|e| e.to_string())?;

//     Ok("Database initialized".to_string())
// }

// #[tauri::command]
// pub fn add_user(state: tauri::State<AppState>, name: String, email: String) -> Result<String, String> {
//     let conn = state.conn.lock().unwrap();

//     conn.execute(
//         "INSERT INTO users (name, email) VALUES (?1, ?2)",
//         params![name, email],
//     )
//     .map_err(|e| e.to_string())?;

//     Ok(format!("User {} added", name))
// }

// #[tauri::command]
// pub fn get_users(state: tauri::State<AppState>) -> Result<Vec<(i32, String, String)>, String> {
//     let conn = state.conn.lock().unwrap();

//     let mut stmt = conn
//         .prepare("SELECT id, name, email FROM users")
//         .map_err(|e| e.to_string())?;

//     let users_iter = stmt
//         .query_map([], |row| {
//             Ok((row.get(0)?, row.get(1)?, row.get(2)?))
//         })
//         .map_err(|e| e.to_string())?;

//     let mut users = Vec::new();
//     for user in users_iter {
//         users.push(user.map_err(|e| e.to_string())?);
//     }

//     Ok(users)
// }

// #[tauri::command]
// pub fn add_time_series_data(
//     state: tauri::State<AppState>,
//     timestamp: String,
//     value: f64,
//     metadata: String,
// ) -> Result<String, String> {
//     let conn = state.conn.lock().unwrap();

//     conn.execute(
//         "INSERT INTO time_series (timestamp, value, metadata) VALUES (?1, ?2, ?3)",
//         params![timestamp, value, metadata],
//     )
//     .map_err(|e| e.to_string())?;

//     Ok("Time series data added successfully".to_string())
// }

// #[tauri::command]
// pub fn get_time_series_data(
//     state: tauri::State<AppState>,
// ) -> Result<Vec<(i32, String, f64, String)>, String> {
//     let conn = state.conn.lock().unwrap();

//     let mut stmt = conn
//         .prepare("SELECT id, timestamp, value, metadata FROM time_series")
//         .map_err(|e| e.to_string())?;

//     let time_series_iter = stmt
//         .query_map([], |row| {
//             Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
//         })
//         .map_err(|e| e.to_string())?;

//     let mut time_series_data = Vec::new();
//     for data in time_series_iter {
//         time_series_data.push(data.map_err(|e| e.to_string())?);
//     }

//     Ok(time_series_data)
// }
