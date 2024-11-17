// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;

use tauri::State;
use db::{initialize_connection, AppState, initialize_db, add_user};

#[tauri::command]
fn greet(name: &str) -> String {
    println!("inside rust code");
    format!("hello {}!", name)
}

fn main() {
    let conn = initialize_connection().expect("Failed to initialize db");

    tauri::Builder::default()
        // This is where you pass in your commands
        .manage(AppState {
            conn: Mutext::new(conn),
        })
        .invoke_handler(tauri::generate_handler![greet, initialize_db, add_user])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
