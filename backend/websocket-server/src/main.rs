// use std::os::windows::process;
use std::{sync::Arc};
use futures_util::stream::SplitSink;
use futures_util::{SinkExt, StreamExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::Mutex;
use tokio::sync::watch;
use tokio_tungstenite::{
    accept_async,
    tungstenite::{Message},
    WebSocketStream,
};
use tokio_util::sync::CancellationToken;
use shared_logic::bc::{start_broadcast};
use shared_logic::db::{initialize_connection};
use shared_logic::lsl::{ProcessingConfig, WindowingConfig}; // get ProcessingConfig from lsl.rs
use dotenvy::dotenv;
use log::{info, error};
use serde_json::{Deserialize, Value}; // used to parse ProcessingConfig from JSON sent by frontend


#[derive(Deserialize)]
struct WebSocketInitMessage{
    session_id: i32,
    processing_config: ProcessingConfig,
}

#[tokio::main]
async fn main() {
    env_logger::init();
    info!("Starting WebSocket server...");

    dotenv().ok();
    info!("Environment variables loaded.");
    initialize_connection().await.expect("Failed to initialize db");
    run_server().await;
}

pub async fn run_server() {
    // Get host and port from environment variables, with fallbacks
    let host = std::env::var("WS_HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
    let port = std::env::var("WS_PORT").unwrap_or_else(|_| "8080".to_string()).parse::<u16>()
        .expect("Invalid WS_PORT environment variable. Must be a valid port number.");

    let addr = format!("{}:{}", host, port);

    let listener = TcpListener::bind(&addr).await.unwrap_or_else(|e| {
        error!("Failed to bind to address {}: {}", addr, e);
        panic!("Exiting due to address binding failure.");
    });
    info!("WebSocket server running at ws://{}", addr);

    while let Ok((stream, _)) = listener.accept().await {
        info!("Incoming TCP connection from: {}", stream.peer_addr().unwrap());
        tokio::spawn(handle_ws(stream));
    }
}

// handle_ws accepts a Tcp connection and upgrades it to a WebSocket connection.
// If successfully upgraded, print "Client connected", and call another function to do stuff with it.
// If not successfully, log the error to standard error.
async fn handle_ws(stream: TcpStream) {
    // Get the peer address BEFORE moving `stream` into accept_async
    let peer_addr = match stream.peer_addr() {
        Ok(addr) => Some(addr),
        Err(e) => {
            error!("Failed to get peer address: {}", e);
            None
        }
    };

    match accept_async(stream).await {
        Ok(ws_stream) => {
            if let Some(addr) = peer_addr {
                info!("Client connected: {:?}", addr); // Use the stored peer_addr
            } else {
                info!("Client connected (address unknown)");
            }
            handle_connection(ws_stream).await;
        }
        Err(e) => error!("WebSocket handshake error: {}", e),
    }
}

async fn handle_connection(ws_stream: WebSocketStream<TcpStream>) {
    let (write, mut read) = ws_stream.split();
    let write = Arc::new(Mutex::new(write));
    let write_clone = write.clone();
    let cancel_token = CancellationToken::new();
    let cancel_clone = cancel_token.clone();

    let mut processing_config = ProcessingConfig::default();
    let mut initial_windowing = WindowingConfig::default();

    // we have the WebSocketInitMessage struct, with a session id and processing config
    // check if we received a message (some unwrapping needed)
    let init_message: WebSocketInitMessage = match signal_config {
        Some(Ok(msg)) => {
            let text = match msg.to_text() {
                Ok(t) => t,
                Err(e) => {
                    error!("Failed to convert init message to text: {}", e);
                    return;
                }
            };

            match serde_json::from_str::<WebSocketInitMessage>(text) {
                Ok(init_msg) => init_msg,
                Err(e) => {
                    error!("Failed to parse init message JSON: {}", e);
                    return;
                }
          }
      }
      
      Some(Err(e)) => {
        error!("Error receiving initialization message: {}", e);
        return;
      }
      
      None => {
        error!("No initialization message received from client. Closing connection.");
        return;
      }
    };
  
  
    let session_id = init_message.session_id;
    processing_config = init_message.processing_config.
  
    // Give the frontend a short window to send configs before we start
    // Use a timeout so we don't block forever if only one config arrives
    let config_timeout = tokio::time::Duration::from_millis(500);
    let deadline = tokio::time::Instant::now() + config_timeout;

    loop {
        let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
        if remaining.is_zero() {
            info!("Config window elapsed, starting with current configs.");
            break;
        }

        match tokio::time::timeout(remaining, read.next()).await {
            Ok(Some(Ok(msg))) if msg.is_text() => {
                let text = msg.to_text().unwrap();
                if text == "clientClosing" {
                    info!("Client closing during config phase.");
                    return;
                }
                match parse_config_message(text) {
                    ConfigMessage::Processing(cfg) => {
                        info!("Received ProcessingConfig");
                        processing_config = cfg;
                    }
                    ConfigMessage::Windowing(cfg) => {
                        info!("Received WindowingConfig: chunk={}, overlap={}", cfg.chunk_size, cfg.overlap_size);
                        initial_windowing = cfg;
                    }
                    ConfigMessage::Unknown => {
                        info!("Non-config message during config phase: {}", text);
                        break;
                    }
                }
            }
            Ok(Some(Err(e))) => { error!("Error receiving config: {}", e); return; }
            Ok(None) => { error!("Connection closed during config phase."); return; }
            Err(_) => {
                // Timeout elapsed
                info!("Config timeout, starting with received configs.");
                break;
            }
            Ok(_) => {}
        }
    }


    info!("Starting broadcast with chunk={}, overlap={}", initial_windowing.chunk_size, initial_windowing.overlap_size);

    let (windowing_tx, windowing_rx) = watch::channel(initial_windowing);

    // spawns the broadcast task
    let mut broadcast = Some(tokio::spawn(async move {
        // pass ProcessingConfig, WindowingConfig receiver, and session_id into broadcast
        start_broadcast(write_clone, cancel_clone, processing_config, session_id, windowing_rx).await;
    }));


    while let Some(msg) = read.next().await {
        match msg {
            Ok(msg) if msg.is_text() => {
                let text = msg.to_text().unwrap();
                if text == "clientClosing" {
                    handle_prep_close(&mut broadcast, &cancel_token, &write).await;
                    break;
                }
                match parse_config_message(text) {
                    ConfigMessage::Windowing(cfg) => {
                        info!("Windowing update: chunk={}, overlap={}", cfg.chunk_size, cfg.overlap_size);
                        let _ = windowing_tx.send(cfg);
                    }
                    ConfigMessage::Processing(_) => {
                        info!("Processing config update received");
                    }
                    ConfigMessage::Unknown => {
                        error!("Unknown mid-stream message: {}", text);
                    }
                }
            }
            Ok(Message::Close(frame)) => {
                let mut w = write.lock().await;
                let _ = w.send(Message::Close(frame)).await;
                break;
            }
            Ok(_) => continue,
            Err(e) => { error!("Read error: {}", e); break; }
        }
    }
    info!("Client disconnected.");
}

// Discriminate config type by which fields are present
enum ConfigMessage {
    Processing(ProcessingConfig),
    Windowing(WindowingConfig),
    Unknown,
}

fn parse_config_message(text: &str) -> ConfigMessage {
    let Ok(value) = serde_json::from_str::<Value>(text) else {
        return ConfigMessage::Unknown;
    };
    if value.get("chunk_size").is_some() {
        match serde_json::from_value::<WindowingConfig>(value) {
            Ok(cfg) => ConfigMessage::Windowing(cfg),
            Err(e) => { error!("Failed to parse WindowingConfig: {}", e); ConfigMessage::Unknown }
        }
    } else if value.get("apply_bandpass").is_some() {
        match serde_json::from_value::<ProcessingConfig>(value) {
            Ok(cfg) => ConfigMessage::Processing(cfg),
            Err(e) => { error!("Failed to parse ProcessingConfig: {}", e); ConfigMessage::Unknown }
        }
    } else {
        ConfigMessage::Unknown
    }
}

// handle_prep_close uses the cancel_token to stop the broadcast sender task, and sends a "prep close complete" message to the client
async fn handle_prep_close(
    broadcast_task: &mut Option<tokio::task::JoinHandle<()>>,
    cancel_token: &CancellationToken,
    write: &Arc<Mutex<SplitSink<WebSocketStream<TcpStream>, Message>>>
) {
    cancel_token.cancel();

    //wait for Broadcast task to finish before sending the message
    if let Some(task) = broadcast_task.take() {
        match task.await {
            Ok(_) => info!("Broadcast task finished successfully"),
            Err(e) => error!("Broadcast task panicked: {:?}", e),
        }
    }

    let mut write_guard = write.lock().await;
    if let Err(e) = write_guard.send(Message::Text("confirmed closing".into())).await {
        log::error!("Failed to send message: {}", e);
    }else {
        info!("Notified client prep close is complete.");
    }
}
