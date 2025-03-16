use rusqlite::{params, Connection, Result};
use std::sync::Mutex;

// shared state for db connection
pub struct AppState {
    pub conn: Mutex<Connection>,
}

pub fn initialize_connection() -> Result<Connection> {
    Connection::open("app.db")
}

#[tauri::command]
pub fn initialize_db(state: tauri::State<AppState>) -> Result<String, String> {
    let conn = state.conn.lock().unwrap();

    // users table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    // time series table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS time_series (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            value REAL NOT NULL,
            metadata TEXT
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    Ok("Database initialized".to_string())
}

#[tauri::command]
pub fn add_user(state: tauri::State<AppState>, name: String, email: String) -> Result<String, String> {
    let conn = state.conn.lock().unwrap();

    conn.execute(
        "INSERT INTO users (name, email) VALUES (?1, ?2)",
        params![name, email],
    )
    .map_err(|e| e.to_string())?;

    Ok(format!("User {} added", name))
}

#[tauri::command]
pub fn get_users(state: tauri::State<AppState>) -> Result<Vec<(i32, String, String)>, String> {
    let conn = state.conn.lock().unwrap();

    let mut stmt = conn
        .prepare("SELECT id, name, email FROM users")
        .map_err(|e| e.to_string())?;

    let users_iter = stmt
        .query_map([], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })
        .map_err(|e| e.to_string())?;

    let mut users = Vec::new();
    for user in users_iter {
        users.push(user.map_err(|e| e.to_string())?);
    }

    Ok(users)
}

#[tauri::command]
pub fn add_time_series_data(
    state: tauri::State<AppState>,
    timestamp: String,
    value: f64,
    metadata: String,
) -> Result<String, String> {
    let conn = state.conn.lock().unwrap();

    conn.execute(
        "INSERT INTO time_series (timestamp, value, metadata) VALUES (?1, ?2, ?3)",
        params![timestamp, value, metadata],
    )
    .map_err(|e| e.to_string())?;

    Ok("Time series data added successfully".to_string())
}

#[tauri::command]
pub fn get_time_series_data(
    state: tauri::State<AppState>,
) -> Result<Vec<(i32, String, f64, String)>, String> {
    let conn = state.conn.lock().unwrap();

    let mut stmt = conn
        .prepare("SELECT id, timestamp, value, metadata FROM time_series")
        .map_err(|e| e.to_string())?;

    let time_series_iter = stmt
        .query_map([], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        })
        .map_err(|e| e.to_string())?;

    let mut time_series_data = Vec::new();
    for data in time_series_iter {
        time_series_data.push(data.map_err(|e| e.to_string())?);
    }

    Ok(time_series_data)
}
