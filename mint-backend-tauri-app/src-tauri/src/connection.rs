
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


#[derive(Serialize)]
struct Data {
    time: u128,
    signals: Vec<u8>,
}

//main listens in on "127.0.0.1:8080" or "localhost:8080", and loops to look for connections
// If connection is found, it create a asynchronous "handle_ws" task to handle it.
#[tokio::main]
async fn main() {
    run_server().await;
}

pub async fn run_server(){
     let addr = "127.0.0.1:8080";
    let listener = TcpListener::bind(addr).await.expect("Can't bind to port 8080");
    println!("WebSocket server running at ws://{}", addr);

    while let Ok((stream, _)) = listener.accept().await {
        tokio::spawn(handle_ws(stream));
    }

}

//handle_ws accepts a Tcp conection and upgrades it to a WebSocket connection,
// if successfully upgradeded to Websocket, print "Client connected", and call another function to do stuff with it.
// if not successfully, log the error to standard error.
async fn handle_ws(stream: TcpStream) {
    match accept_async(stream).await {
        Ok(ws_stream) => {
            println!("Client connected");
            handle_connection(ws_stream).await;
        }
        Err(e) => eprintln!("WebSocket handshake error: {}", e),
    }
}

// handle_connection, does stuff with the WebSocket connection
// Right now, it sets up a asynchronous write task to send random data.
// It also listens for incoming websocket closing request with the read stream inorder to stop the write task.
async fn handle_connection(mut ws_stream: WebSocketStream<TcpStream>){
    let (mut write, mut read) = ws_stream.split();

    let sender = tokio::spawn(async move {
    if let Err(e) = send_random_data(&mut write).await {
        eprintln!("{}", e);
        }
    });

     while let Some(msg) = read.next().await {
        match msg {
            Ok(Message::Close(_)) => {
                println!("Received a close request from the client");
                break;
            }
            Ok(_) => continue, 
            Err(e) => {
                eprintln!("Read error (client likely disconnected): {}", e);
                break;
            }
        }
    }

    sender.abort();
}

// sendRandomData takes the write stream, and loops to send random data
async fn send_random_data(write: &mut SplitSink<WebSocketStream<TcpStream>, Message>) -> Result<(), tungstenite::Error>{
    let mut ticker = interval(Duration::from_millis(3));

    loop {
        ticker.tick().await;

        let data = generate_random_data();
        let json = serde_json::to_string(&data).unwrap();
        println!("data sent: {}", json);
        write.send(Message::Text(json)).await?;
    }
}

fn generate_random_data() -> Data {
    Data {
        time: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis(),
        signals: (0..5).map(|_| rand::thread_rng().gen_range(0..100)).collect(),
    }
}
