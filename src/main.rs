use actix_web::{web, App, HttpServer, Responder, HttpResponse};
use actix_web::web::Bytes;
use futures_util::stream::{Stream, StreamExt};
use std::sync::{Arc, Mutex};
use tokio::time::{sleep, Duration};
use rand::Rng;
use async_stream::stream;
use serde_json::to_string;
use log::info; // Logging

// Shared state to track simulation status and client streams
struct AppState {
    is_running: Arc<Mutex<bool>>,
    upper_limit: Arc<Mutex<i32>>,
}

// Endpoint to start the simulation
async fn start_simulation(data: web::Data<AppState>) -> impl Responder {
    let mut is_running = data.is_running.lock().unwrap();
    *is_running = true;
    info!("Simulation started"); // Log start
    HttpResponse::Ok().body("Simulation started")
}

// Endpoint to stop the simulation
async fn stop_simulation(data: web::Data<AppState>) -> impl Responder {
    let mut is_running = data.is_running.lock().unwrap();
    *is_running = false;
    info!("Simulation stopped"); // Log stop
    HttpResponse::Ok().body("Simulation stopped")
}

// Generates a stream of simulated data vectors
fn generate_data_stream(data: web::Data<AppState>) -> impl Stream<Item = Result<Bytes, actix_web::Error>> {
    let upper_limit = data.upper_limit.clone();
    Box::pin(stream! {
        while *data.is_running.lock().unwrap() {
            let upper_limit = *upper_limit.lock().unwrap();
            let mut vector = Vec::with_capacity(64);
            for _ in 0..64 {
                vector.push(rand::thread_rng().gen_range(1..=upper_limit));
            }
            let json = to_string(&vector).unwrap();
            info!("Generated vector: {:?}", json); // Log each generated vector
            yield Ok(Bytes::from(json + "\n"));
            sleep(Duration::from_millis(100)).await;
        }
    })
}

// Endpoint to stream simulated data to the client in real-time
async fn data_stream(data: web::Data<AppState>) -> impl Responder {
    info!("Streaming data..."); // Log start of streaming
    HttpResponse::Ok()
        .content_type("application/json")
        .streaming(generate_data_stream(data))
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    env_logger::init(); // Initialize logging

    let state = web::Data::new(AppState {
        is_running: Arc::new(Mutex::new(false)),
        upper_limit: Arc::new(Mutex::new(100)), // Default upper limit
    });

    HttpServer::new(move || {
        App::new()
            .app_data(state.clone())
            .wrap(actix_cors::Cors::permissive()) // Allow global access
            .route("/start", web::post().to(start_simulation))
            .route("/stop", web::post().to(stop_simulation))
            .route("/data", web::get().to(data_stream))
    })
    .bind("0.0.0.0:8080")?
    .run()
    .await
}
