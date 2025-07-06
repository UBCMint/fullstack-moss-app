use std::{sync::Arc};
use futures_util::stream::SplitSink;
use futures_util::{SinkExt, StreamExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::Mutex;
use tokio_tungstenite::{
    accept_async,
    tungstenite::{Message},
    WebSocketStream,
};
use tokio_util::sync::CancellationToken;
use shared_logic::bc::{start_broadcast};
use shared_logic::db::{initialize_connection};
use dotenvy::dotenv;
use log::{info, error};


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

// handle_connection, starts a async broadcast task, 
// then listens for incoming websocket closing request with the read stream in order to stop the broadcast task.
async fn handle_connection(ws_stream: WebSocketStream<TcpStream>) {
    let ( write, mut read) = ws_stream.split();
    // set up for the broadcast task
    let write = Arc::new(Mutex::new(write)); 
    let write_clone = write.clone();
    let cancel_token = CancellationToken::new();
    let cancel_clone = cancel_token.clone();
    // spawns the broadcast task
    let mut broadcast = Some(tokio::spawn(async move {
        start_broadcast(write_clone, cancel_clone).await;
    }));


    //listens for incoming messages 
    while let Some(msg) = read.next().await {
        match msg {
            Ok(msg) if msg.is_text() => { //prep for closing, this currently will not be called, waiting for frontend
                let text = msg.to_text().unwrap();
                info!("Received request: {}", text);
                if text == "prep close" {
                    handle_prep_close(&mut broadcast,&cancel_token, &write.clone()).await;
                }
            }
            Ok(Message::Close(frame)) => { //handles closing.
                info!("Received a close request from the client");
                cancel_token.cancel(); // remove after frontend updates
                let mut write = write.lock().await;
                let _ = write.send(Message::Close(frame)).await;
                break;
            }
            Ok(_) => continue,
            Err(e) => {
                error!("Read error (client likely disconnected): {}", e);
                break;
            }
        }
    }
    info!("Client disconnected.");
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
    if let Err(e) = write_guard.send(Message::Text("prep close complete".into())).await {
        log::error!("Failed to send message: {}", e);
    }else {
        info!("Notified client prep close is complete.");
    }
}

