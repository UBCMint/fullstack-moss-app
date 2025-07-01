use std::time::{Duration, SystemTime, UNIX_EPOCH};

use futures_util::{SinkExt, StreamExt};
use rand::Rng;
use serde::Serialize;
use tokio::net::{TcpListener, TcpStream};
use tokio::time::interval;
use tokio_tungstenite::{
    accept_async,
    tungstenite::{self, Message},
    WebSocketStream,
};
use futures_util::stream::SplitSink;
use dotenvy::dotenv;
use log::{info, error};

#[derive(Serialize)]
struct Data {
    time: u128,
    signals: Vec<u8>,
}

#[tokio::main]
async fn main() {
    env_logger::init();
    info!("Starting WebSocket server...");

    dotenv().ok();
    info!("Environment variables loaded.");

    run_server().await;
}

pub async fn run_server() {
    // Get host and port from environment variables, with fallbacks
    let host = std::env::var("WS_HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
    let port = std::env::var("WS_PORT").unwrap_or_else(|_| "9000".to_string()).parse::<u16>()
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

// handle_connection, does stuff with the WebSocket connection
// Right now, it sets up an asynchronous write task to send random data.
// It also listens for incoming websocket closing request with the read stream in order to stop the write task.
async fn handle_connection(ws_stream: WebSocketStream<TcpStream>) {
    let (mut write, mut read) = ws_stream.split();

    let sender = tokio::spawn(async move {
        if let Err(e) = send_random_data(&mut write).await {
            error!("Error sending random data: {}", e);
        }
    });

    while let Some(msg) = read.next().await {
        match msg {
            Ok(Message::Close(_)) => {
                info!("Received a close request from the client");
                break;
            }
            Ok(_) => continue,
            Err(e) => {
                error!("Read error (client likely disconnected): {}", e);
                break;
            }
        }
    }

    sender.abort();
    info!("Client disconnected.");
}

// send_random_data takes the write stream, and loops to send random data
async fn send_random_data(write: &mut SplitSink<WebSocketStream<TcpStream>, Message>) -> Result<(), tungstenite::Error> {
    let mut ticker = interval(Duration::from_millis(3));

    loop {
        ticker.tick().await;

        let data = generate_random_data();
        let json = serde_json::to_string(&data).unwrap(); // In a real app, handle unwrap()
        info!("data sent: {}", json);
        write.send(Message::Text(json)).await?;
    }
}

fn generate_random_data() -> Data {
    Data {
        time: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap() // In a real app, handle unwrap() for duration_since
            .as_millis(),
        signals: (0..5).map(|_| rand::thread_rng().gen_range(0..100)).collect(),
    }
}
