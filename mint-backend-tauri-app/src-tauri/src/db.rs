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

    conn.execute(
        "CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE
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