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
    is_running: Arc<Mutex<bool>>, // Using threading allows for concurrent requests to be made
    upper_limit: Arc<Mutex<i32>>,
}

// Endpoint to start the simulation
async fn start_simulation(data: web::Data<AppState>) -> impl Responder {
    // Locks the thread such for the safe access of shared variables
    let mut is_running = data.is_running.lock().unwrap();
    // Sets the simulation to true
    *is_running = true;
    info!("Simulation started"); // Log start
    HttpResponse::Ok().body("Simulation started")
}

// Endpoint to stop the simulation
async fn stop_simulation(data: web::Data<AppState>) -> impl Responder {
    // Locks the thread such for the safe access of shared variables
    let mut is_running = data.is_running.lock().unwrap();
    // Sets the simulation to false
    *is_running = false;
    info!("Simulation stopped"); // Log stop
    HttpResponse::Ok().body("Simulation stopped")
}

// Generates a stream of simulated data vectors
fn generate_data_stream(data: web::Data<AppState>) -> impl Stream<Item = Result<Bytes, actix_web::Error>> {
    // Increases the refereces to upper_limit
    let upper_limit = data.upper_limit.clone();
    // Wraps the stream in a box, a fixed memory location, so the function can safely return it
    // stream allows us to yield items one at a time inside this block
    Box::pin(stream! {
        // Locks the thread for safe access of shared variables
        while *data.is_running.lock().unwrap() {
            // Locks the thread for the safe access of shared variables
            let upper_limit = *upper_limit.lock().unwrap();
            // Creates an empty list (vector) with space reserved for 64 items
            let mut vector = Vec::with_capacity(64);
            // Loops 64 times. Each time it runs, it generates a random number
            for _ in 0..64 {
                vector.push(rand::thread_rng().gen_range(1..=upper_limit));
            }
            // Converts the vector to Json format
            let json = to_string(&vector).unwrap();
            // Logs a message at the "info" level, which is a way to track program events
            info!("Generated vector: {:?}", json);  
            // this produces a piece of data to be sent to the client
            yield Ok(Bytes::from(json + "\n"));
            // Run after every 100ms
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
            .route("/start", web::post().to(start_simulation)) // End point to start the simulation
            .route("/stop", web::post().to(stop_simulation)) // End point to stop the simulation
            .route("/data", web::get().to(data_stream)) // End point to visualize the generated data
    })
    .bind("0.0.0.0:8080")?
    .run()
    .await
}
