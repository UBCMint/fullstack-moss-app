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
use pyo3::types::PyTuple;

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

        // Compile the Python script into a module
        let module = PyModule::from_code(py, &script, "hello.py", "hello")
            .expect("Failed to create Python module");

        let greet_func = module.getattr("test")
            .expect("Failed to get 'test' function")
            .to_object(py);

        // Define the arguments to pass to the 'test' function
        let args = PyTuple::new(py, &[20, 30]);

        // Call the 'test' function with the arguments
        let result = greet_func.call1(py, args)
            .expect("Failed to call 'test' function");

        // Extract the result as a Rust string
        let result_str: String = result.extract(py)
            .expect("Failed to extract result as String");

        // Print the result
        println!("Result from Python: {}", result_str);
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
