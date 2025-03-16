// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;
use tauri::State;
use std::sync::Mutex;
use pyo3::types::PyModule;
use std::fs;
use std::env;
use pyo3::prelude::*;
use pyo3::types::PyTuple;
use tokio::net::TcpListener;
use tokio_tungstenite::{accept_async, tungstenite::protocol::Message};
use futures_util::{SinkExt, StreamExt};
use serde_json::json;
use std::time::Duration;
use std::sync::Arc;
use tokio::sync::Mutex as AsyncMutex;
use rand::Rng;
use chrono::Utc;
use db::{
    initialize_connection, 
    AppState, 
    initialize_db, 
    add_user, 
    get_users, 
    add_time_series_data, 
    get_time_series_data,
    DbClient,
    add_testtime_series_data,
    get_testtime_series_data,
};

/// Command wrapper for adding a user.
#[tauri::command]
async fn add_user_command(state: tauri::State<'_, DbClient>, name: String, email: String) -> Result<String, String> {
    add_user(state.inner().clone(), name, email)
        .await
        .map_err(|e| e.to_string())
}

/// Command wrapper for initializing the database.
#[tauri::command]
async fn initialize_db_command(state: tauri::State<'_, DbClient>) -> Result<String, String> {
    initialize_db(state.inner().clone())
        .await
        .map_err(|e| e.to_string())
}

/// Command wrapper for retrieving users.
#[tauri::command]
async fn get_users_command(state: tauri::State<'_, DbClient>) -> Result<Vec<(i32, String, String)>, String> {
    get_users(state.inner().clone())
        .await
        .map_err(|e| e.to_string())
}

/// Command wrapper for adding test time series data.
/// Expects a timestamp in milliseconds.
#[tauri::command]
async fn add_testtime_series_data_command(
    state: tauri::State<'_, DbClient>, 
    timestamp: i64, 
    value: f64, 
    metadata: String
) -> Result<String, String> {
    // Convert timestamp (milliseconds) to chrono::DateTime<Utc>
    let dt = chrono::DateTime::<Utc>::from_utc(
        chrono::NaiveDateTime::from_timestamp(timestamp / 1000, ((timestamp % 1000) * 1_000_000) as u32),
        Utc
    );
    add_testtime_series_data(state.inner().clone(), dt, value, metadata)
        .await
        .map_err(|e| e.to_string())
}

/// Command wrapper for retrieving test time series data.
#[tauri::command]
async fn get_testtime_series_data_command(state: tauri::State<'_, DbClient>) -> Result<Vec<(i32, chrono::DateTime<Utc>, f64, String)>, String> {
    get_testtime_series_data(state.inner().clone())
        .await
        .map_err(|e| e.to_string())
}


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

/// TODO: implement the actual logic to select a model.
#[tauri::command]
async fn select_model(filter: String, model_type: String) -> Result<String, String> {
    // TODO: add logic based on `filter` and `model_type`
    Ok(format!("Selected model with filter '{}' and type '{}'", filter, model_type))
}

/// function to simulate processed EEG data with random values.
fn simulate_eeg_data() -> String {
    let mut rng = rand::thread_rng();
    let data = vec![
        json!({"timestamp": Utc::now().timestamp_millis(), "channel": "1", "value": rng.gen_range(10.0..20.0)}),
        json!({"timestamp": Utc::now().timestamp_millis(), "channel": "2", "value": rng.gen_range(10.0..20.0)}),
        json!({"timestamp": Utc::now().timestamp_millis(), "channel": "3", "value": rng.gen_range(10.0..20.0)}),
    ];
    serde_json::to_string(&data).unwrap()
}

/// Function to start the WebSocket server.
async fn start_websocket_server() {
    let listener = TcpListener::bind("127.0.0.1:9000").await.unwrap();
    println!("WebSocket server listening on ws://127.0.0.1:9000");

    while let Ok((stream, addr)) = listener.accept().await {
        tauri::async_runtime::spawn(async move {
            let ws_stream = accept_async(stream).await.expect("Failed to accept");
            println!("New WebSocket connection from {}", addr);

            let (write, mut read) = ws_stream.split();
            let write = Arc::new(AsyncMutex::new(write));

            // Handle incoming WebSocket messages.
            while let Some(message) = read.next().await {
                match message {
                    Ok(msg) if msg.is_text() => {
                        let text = msg.to_text().unwrap();
                        println!("Received request: {}", text);
                        
                        if text == "get_eeg" {
                            // Spawn a task that sends EEG data every second.
                            let write_clone = Arc::clone(&write);
                            tokio::spawn(async move {
                                let mut interval = tokio::time::interval(Duration::from_millis(10));
                                loop {
                                    interval.tick().await;
                                    let eeg_data = simulate_eeg_data();
                                    if let Err(e) = write_clone.lock().await.send(Message::Text(eeg_data)).await {
                                        println!("Error sending EEG data: {}", e);
                                        break;
                                    }
                                }
                            });
                        } else if text == "get_model" {
                            // Keep existing behavior for get_model if needed.
                            let result = select_model("default_filter".to_string(), "default_type".to_string()).await;
                            let response = match result {
                                Ok(val) => val,
                                Err(e) => format!("Error: {}", e),
                            };
                            if let Err(e) = write.lock().await.send(Message::Text(response)).await {
                                println!("Error sending get_model response: {}", e);
                            }
                        } else {
                            // For now send invalid command but we need to discuss potential commands for users.
                            if let Err(e) = write.lock().await.send(Message::Text("Invalid command".into())).await {
                                println!("Error sending invalid command response: {}", e);
                            }
                        }
                    }
                    Ok(_) => {  
                        if let Err(e) = write.lock().await.send(Message::Text("Invalid command".into())).await {
                            println!("Error sending invalid command response: {}", e);
                        }
                    },
                    Err(e) => {
                        println!("Error receiving message: {}", e);
                        break;
                    }
                }
            }
        });
    }
}

fn main() {
    // let conn = initialize_connection().expect("Failed to initialize db");
    // Since initialize_connection() is asynchronous, we block on it at startup.
    let db_client = tauri::async_runtime::block_on(async {
        initialize_connection().await.expect("Failed to initialize db")
    });
    tauri::Builder::default()
        // .manage(AppState {
        //     conn: Mutex::new(conn),
        // })
        .manage(db_client)
        // .invoke_handler(tauri::generate_handler![
        //     greet, 
        //     initialize_db, 
        //     add_user, 
        //     get_users, 
        //     add_time_series_data, 
        //     get_time_series_data, 
        //     run_python_script,
        //     select_model])
        .invoke_handler(tauri::generate_handler![
            greet, 
            run_python_script,
            select_model,
            add_user_command,
            initialize_db_command,
            get_users_command,
            add_testtime_series_data_command,
            get_testtime_series_data_command,
        ])
        .setup(|_app| {
            tauri::async_runtime::spawn(start_websocket_server());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
