// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;
use tauri::State;
use std::sync::Mutex;
use db::{initialize_connection, AppState, initialize_db, add_user, get_users, add_time_series_data, get_time_series_data};
use tokio::net::TcpListener;
use tokio_tungstenite::{accept_async, tungstenite::protocol::Message};
use futures_util::{SinkExt, StreamExt};
use serde_json::json;
use std::time::Duration;
use std::sync::Arc;
use tokio::sync::Mutex as AsyncMutex;
use rand::Rng;
use chrono::Utc;

#[tauri::command]
fn greet(name: &str) -> String {
    println!("inside rust code");
    format!("hello {}!", name)
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
    let conn = initialize_connection().expect("Failed to initialize db");
    tauri::Builder::default()
        .manage(AppState {
            conn: Mutex::new(conn),
        })
        .invoke_handler(tauri::generate_handler![
            greet, 
            initialize_db, 
            add_user, 
            get_users, 
            add_time_series_data, 
            get_time_series_data, 
            select_model])
        .setup(|_app| {
            tauri::async_runtime::spawn(start_websocket_server());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
