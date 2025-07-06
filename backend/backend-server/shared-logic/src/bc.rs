use tokio::sync::broadcast;
use tokio::sync::broadcast::Receiver;

use crate::mockeeg::{Data, generate_mock_data_json};
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
    let (tx, _rx) = broadcast::channel::<String>(1000); // size of the broadcast buffer, not recommand below 500, websocket will miss messages
    let rx_ws = tx.subscribe();
    let rx_db = tx.subscribe();

    //spawn a sender task
    let tx_clone = tx.clone();
    let sender_token = cancel_token.clone(); 
    let sender = tokio::spawn(async move {
        generate_mock_data_json(tx_clone, sender_token).await;
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

// ws_broadcast_receiver takes messages from the sender and use the write stream to send it to the websocket client. 
pub async fn ws_receiver(write: &Arc<Mutex<SplitSink<WebSocketStream<TcpStream>, Message>>>, 
    mut rx_ws: Receiver<String>) {
    let mut count = 0;  // for debug purposes
    let mut dropped  = 0;  // for debug purposes

    // loops to hanle messages coming in from broadcast
    loop {
        match rx_ws.recv().await {
            Ok(msg) => { // sends the message 
                info!("websocket got: {}", msg);  // debug purposes
                count += 1; // for debug purposes
                let mut write_guard = write.lock().await;
                if let Err(e) = write_guard.send(Message::Text(msg)).await {
                    error!("Failed to send message: {}", e);
                    break;
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

//db_broadcast_receiver takes the messages from the sender and calls insert_batch_eeg from db.rs to insert it into the database
// it inserts as a batch of 100.
pub async fn db_receiver(mut rx_db: Receiver<String>){
    let mut batch = Vec::new(); 
    let batch_size = 100; // size of the batch, can change later if database is missing data
    let db_client = get_db_client();

    let mut count = 0; // for debug purposes
    let mut dropped  = 0;// for debug purposes

    loop {
        match rx_db.recv().await {
            Ok(msg) => {
                info!("Database got: {}", msg); // debug purposes
                count += 1; // for debug purposes, no need
                if let Ok(data) = serde_json::from_str::<Data>(&msg) {
                    batch.push(data);
                    // info!("Current batch size: {}", batch.len()); //debug purposes

                    // only spawn insert task when batch reaches the batch_size 
                    if batch.len() >= batch_size {
                        // info!("Inserting batch of size {}", batch.len());  // for debug purposes
                        let batch_to_insert = std::mem::take(&mut batch); // empties the batch vector into a batch_to_insert vector
                        let db_client_clone = db_client.clone(); 
                        // spawns the insert task when batch is full
                        tokio::spawn(async move {
                            let now = Instant::now(); // for debug purposes, no need, starts the counter that tells you how long the insert took
                            if let Err(e) = insert_batch_eeg(&db_client_clone, &batch_to_insert).await {
                                error!("Batch insert failed: {:?}", e);
                            }
                            info!("Batch insert took {:?}", now.elapsed()); // for debug purposes, no need, tells you how long the insert took
                        });
                    }
                } else{
                    error!("Failed to parse JSON: {}", msg);
                }
            }
            Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                error!("Receiver lagged, missed {} messages", n);
                dropped  += 1; // for debug purposes, no need
            }
            Err(tokio::sync::broadcast::error::RecvError::Closed) => {
                info!("Sender closed, finishing remaining work.");
                 // insert the leftovers before closing
                if !batch.is_empty() {
                    info!("Inserting final leftover batch of size {}", batch.len());
                    if let Err(e) = insert_batch_eeg(&db_client, &batch).await {
                        error!("Batch insert failed on shutdown: {:?}", e);
                    }
                }
                break;
            }
        }
    }
    info!("database got {} msg, and droped {} msg", count, dropped )
}