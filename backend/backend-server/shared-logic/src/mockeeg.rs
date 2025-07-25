use chrono::{DateTime, Utc};
use rand::Rng;
use tokio::sync::broadcast::Sender;
use tokio::time::interval;
use serde::{Serialize, Deserialize};
use std::time::{Duration};
use tokio_util::sync::CancellationToken;
use log::{info, error};

#[derive(Serialize, Deserialize)]
pub struct Data {
    pub time: DateTime<Utc>,
    pub signals: Vec<i32>,
}
// generate mock eeg json every 3ms
pub async fn generate_mock_data_json(tx: Sender<String>, cancel_token: CancellationToken){
    let mut ticker = interval(Duration::from_millis(3)); // waits 3ms
    let mut count = 0;
    let mut drop = 0;
    loop {
        tokio::select!{
        _ = ticker.tick() => { 
                let data = generate_random_data();
                let json = serde_json::to_string(&data).unwrap(); //convert into json
                if tx.send(json).is_ok() {
                    count += 1;
                } else {
                    drop += 1;
                     error!("Send error!");
                }
            }

        _ = cancel_token.cancelled() => {
                info!("Mock data generator cancelled.");
                break;
            }   
        }
    }
    info!("number of data generated and sent: {}, data droped: {}", count, drop);
}

fn generate_random_data() -> Data {
    Data {
        time: Utc::now(),
        signals: (0..5).map(|_| rand::thread_rng().gen_range(0..100)).collect(),
    }
}