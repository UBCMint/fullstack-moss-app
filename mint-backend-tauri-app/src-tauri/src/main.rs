// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;
use tauri::State;
use std::sync::Mutex;
use db::{initialize_connection, AppState, initialize_db,  add_user, get_users, add_time_series_data, get_time_series_data};
use tokio::net::TcpListener;
use tokio_tungstenite::{accept_async, tungstenite::protocol::Message};
use futures_util::{SinkExt, StreamExt};

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

/// Function to start the WebSocket server.
async fn start_websocket_server() {
    let listener = TcpListener::bind("127.0.0.1:9000").await.unwrap();
    println!("WebSocket server listening on ws://127.0.0.1:9000");

    while let Ok((stream, addr)) = listener.accept().await {
        tauri::async_runtime::spawn(async move {
            let ws_stream = accept_async(stream).await.expect("Failed to accept");
            println!("New WebSocket connection from {}", addr);

            let (mut write, mut read) = ws_stream.split();

            // Handle incoming WebSocket messages.
            while let Some(message) = read.next().await {
                match message {
                    Ok(msg) if msg.is_text() => {
                        let text = msg.to_text().unwrap();
                        println!("Received request: {}", text);
                        
                        if text == "get_model" {
                            // Call select_model with dummy parameters for now.
                            // TODO: parameter validation
                            let result = select_model("default_filter".to_string(), "default_type".to_string()).await;
                            let response = match result {
                                Ok(val) => val,
                                Err(e) => format!("Error: {}", e),
                            };
                            write.send(Message::Text(response)).await.unwrap();
                        }
                        else{
                            // for now send invalid command but we need to discuss what are potential commands for users
                            if let Err(e) = write.send(Message::Text("Invalid command".into())).await {
                                println!("Error sending invalid command response: {}", e);
                            }
                        }
                    }
                    Ok(_) => {  
                        if let Err(e) = write.send(Message::Text("Invalid command".into())).await {
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
            select_model
        ])
        .setup(|_app| {
            tauri::async_runtime::spawn(start_websocket_server());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
