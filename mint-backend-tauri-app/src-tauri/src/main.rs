// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;

use tauri::State;
use std::sync::Mutex;
use db::{initialize_connection, AppState, initialize_db, add_user, get_users, add_time_series_data, get_time_series_data};
use pyo3::types::PyModule;
use std::fs;
use std::env;
use pyo3::prelude::*;

#[tauri::command]
fn greet(name: &str) -> String {
    println!("inside rust code");
    format!("hello {}!", name)
}

#[tauri::command]
fn run_python_script() {
    println!("inside rust code");
    let current_dir = env::current_dir().expect("Failed to get current directory");
    println!("Current directory: {:?}", current_dir);

    // Initialize the Python interpreter
    Python::with_gil(|py| {
        // Read the Python script as a string
        let script = fs::read_to_string("scripts/hello.py")
            .expect("Failed to read Python script");

        // Execute the Python script
        let result = PyModule::from_code(py, &script, "hello.py", "hello");

        match result {
            Ok(module) => {
                println!("Python script executed successfully!");
            }
            Err(e) => {
                println!("Failed to execute Python script!");
                e.print(py);
            }
        }
    });
}

fn main() {
    let conn = initialize_connection().expect("Failed to initialize db");

    tauri::Builder::default()
        // This is where you pass in your commands
        .manage(AppState {
            conn: Mutex::new(conn),
        })
        .invoke_handler(tauri::generate_handler![greet, initialize_db, add_user, get_users, add_time_series_data, get_time_series_data, run_python_script])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
