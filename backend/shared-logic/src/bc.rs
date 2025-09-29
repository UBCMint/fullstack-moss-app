use tokio::sync::broadcast;
use tokio::sync::broadcast::Receiver;

use crate::mockeeg::{generate_mock_data};
use crate::lsl::{EEGDataPacket, receive_eeg};
use crate::db::{insert_batch_eeg, get_db_client};
use futures_util::stream::SplitSink;
use futures_util::{SinkExt};
use tokio::net::{TcpStream};
use tokio_tungstenite::{
    tungstenite::{Message},
    WebSocketStream,
};
use tokio::sync::Mutex;
use std::sync::Arc;
use std::time::Instant;
use tokio_util::sync::CancellationToken;

use log::{info, error};

// starts the broadcast by spawning async sender and receiver tasks.
pub async fn start_broadcast(write: Arc<Mutex<SplitSink<WebSocketStream<TcpStream>, Message>>>,  cancel_token: CancellationToken) {
    let (tx, _rx) = broadcast::channel::<EEGDataPacket>(1000); // size of the broadcast buffer, not recommand below 500, websocket will miss messages
    let rx_ws = tx.subscribe();
    let rx_db = tx.subscribe();
    let generator_token = cancel_token.clone(); 

    ////// spawn the mock data generator, comment out when connecting to the muse headset. 
    tokio::spawn(async move {
       if let Err(e) = generate_mock_data(generator_token).await {
        error!("Mock data generation failed: {}", e);
    }
    });
    ////// comment out the code above when connecting to the muse headset. 
    
    //spawn a sender task
    let tx_clone = tx.clone();
    let sender_token = cancel_token.clone(); 
    let sender = tokio::spawn(async move {
        receive_eeg(tx_clone, sender_token).await;
    });

    // Subscribe for websocket Receiver 
    let write_clone = write.clone();
    tokio::spawn(async move {
        ws_receiver(&write_clone, rx_ws).await;
    });

    // Subscribe for database Receiver 
    tokio::spawn(async move { 
        db_receiver( rx_db).await;
    });

    //waits for sender to complete. 
    match sender.await {
        Ok(_) => info!("Task finished successfully"),
        Err(e) => error!("Task panicked: {:?}", e),
    }
}

// ws_broadcast_receiver takes a EEGDataPacket  struct from the broadcast sender, and converts it to JSON, then send it to the connected websocket client. 
pub async fn ws_receiver(write: &Arc<Mutex<SplitSink<WebSocketStream<TcpStream>, Message>>>, 
    mut rx_ws: Receiver<EEGDataPacket>) {
    let mut count = 0;  // for debug purposes
    let mut dropped  = 0;  // for debug purposes

    // loops to hanle messages coming in from broadcast
    loop {
        match rx_ws.recv().await {
            Ok(eeg_packet) => { // receives the EEGData Packet
                // Serialize to JSON for WebSocket transmission
                match serde_json::to_string(&eeg_packet) {
                    Ok(msg) => {
                        info!("websocket got: {}", msg);  // debug purposes
                        count += 1; // for debug purposes
                        let mut write_guard = write.lock().await;
                        if let Err(e) = write_guard.send(Message::Text(msg)).await {
                            error!("Failed to send message: {}", e);
                            break;
                        }
                    }
                    Err(e) => {
                        error!("Failed to serialize EEGDataPacket  to JSON: {}", e);
                        dropped += 1;
                    }
                }
            }
            Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                error!("Receiver lagged, missed {} messages", n);
                dropped  += 1; // for debug purposes
            }
            Err(tokio::sync::broadcast::error::RecvError::Closed) => {
                info!("Sender closed");
                break;
            }
        }
    }
    info!("websocket got {} msg, and dropped {} msg", count, dropped ) // for debug purposes
}

//db_broadcast_receiver takes EEGDataPacket  struct from the broadcast sender and inserts it into the database
// it inserts as a batch of 100.
pub async fn db_receiver(mut rx_db: Receiver<EEGDataPacket>){
    let db_client = get_db_client();

    let mut packet_count = 0; // for debug purposes
    let mut sample_count = 0; // for debug purposes
    let mut dropped = 0;// for debug purposes

    loop {
        match rx_db.recv().await {
            Ok(eeg_packet) => {
                let num_samples = eeg_packet.signals.len();
                info!("Database got packet with {} samples", num_samples); // debug purposes
                packet_count += 1; // for debug purposes
                sample_count += num_samples; // for debug purposes
                
                let db_client_clone = db_client.clone();
                
                // Insert the packet directly
                tokio::spawn(async move {
                    let now = Instant::now(); // for debug purposes
                    if let Err(e) = insert_batch_eeg(&db_client_clone, &eeg_packet).await {
                        error!("Packet insert failed: {:?}", e);
                    }
                    info!("Packet insert took {:?}", now.elapsed()); // for debug purposes
                });
            }
            Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                error!("Receiver lagged, missed {} messages", n);
                dropped += 1; // for debug purposes
            }
            Err(tokio::sync::broadcast::error::RecvError::Closed) => {
                info!("Sender closed, finishing remaining work.");
                break;
            }
        }
    }
    info!("database got {} packets ({} total samples), and dropped {} msg", packet_count, sample_count, dropped)
}