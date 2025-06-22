// Old websocket code that could be useful in the future

use tokio::net::TcpListener;
use tokio_tungstenite::{accept_async, tungstenite::protocol::Message};
use futures_util::{SinkExt, StreamExt};

async fn start_websocket_server() {
    let listener = TcpListener::bind("127.0.0.1:9000").await.unwrap();
    println!("WebSocket server listening on ws://127.0.0.1:9000");

    while let Ok((stream, addr)) = listener.accept().await {
        tauri::async_runtime::spawn(async move {
            let ws_stream = accept_async(stream).await.expect("Failed to accept");
            println!("New WebSocket connection from {}", addr);

            let (write, mut read) = ws_stream.split();
            let write = Arc::new(AsyncMutex::new(write));

            while let Some(message) = read.next().await {
                match message {
                    Ok(msg) if msg.is_text() => {
                        let text = msg.to_text().unwrap();
                        println!("Received request: {}", text);
                        
                        if text == "get_eeg" {
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
                            let result = select_model("default_filter".to_string(), "default_type".to_string()).await;
                            let response = match result {
                                Ok(val) => val,
                                Err(e) => format!("Error: {}", e),
                            };
                            if let Err(e) = write.lock().await.send(Message::Text(response)).await {
                                println!("Error sending get_model response: {}", e);
                            }
                        } else {
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
    }}