use axum::{
    extract::State,
    http::StatusCode,
    routing::{get, post},
    Json,
    Router,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::net::TcpListener;
use log::{info, error};
use dotenvy::dotenv;

// shared logic library
use shared_logic::db::{initialize_connection, DbClient};
use shared_logic::models::{User, NewUser};

// Define application state
#[derive(Clone)]
struct AppState {
    db_client: DbClient,
}

// creates new user when POST /users is called
async fn create_user(
    State(app_state): State<AppState>,
    Json(new_user_data): Json<NewUser>,
) -> Result<Json<User>, (StatusCode, String)> {
    info!("Received request to create user: {:?}", new_user_data);

    match shared_logic::db::add_user(
        &app_state.db_client,
        new_user_data,
    )
    .await
    {
        Ok(created_user) => {
            info!("User created successfully: {:?}", created_user);
            Ok(Json(created_user))
        }
        Err(e) => {
            error!("Failed to create user: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to create user: {}", e),
            ))
        }
    }
}

// Handler for GET /users
// This function will retrieve all users from the database.
async fn get_all_users(
    State(app_state): State<AppState>, // Access shared database client
) -> Result<Json<Vec<User>>, (StatusCode, String)> {
    info!("Received request to get all users");

    match shared_logic::db::get_users(&app_state.db_client).await {
        Ok(users) => {
            info!("Retrieved {} users.", users.len());
            Ok(Json(users)) // Return list of users as JSON
        }
        Err(e) => {
            error!("Failed to retrieve users: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to retrieve users: {}", e),
            ))
        }
    }
}

#[tokio::main]
async fn main() {
    env_logger::init();
    info!("Starting API server...");

    dotenv().ok();
    info!("Environment variables loaded.");

    let db_client = match initialize_connection().await {
        Ok(client) => {
            info!("Database connection initialized successfully.");
            client
        }
        Err(e) => {
            error!("Failed to initialize database connection: {}", e);
            panic!("Exiting due to database connection failure.");
        }
    };

    let app_state = AppState {
        db_client: db_client.clone(),
    };

    // Build Axum router
    let app = Router::new()
        .route("/users", post(create_user))
        .route("/users", get(get_all_users))
        // Share application state with all handlers
        .with_state(app_state);

    // Define the address and port for the server to listen on.
    let host = std::env::var("API_HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
    let port = std::env::var("API_PORT")
        .unwrap_or_else(|_| "9000".to_string())
        .parse::<u16>()
        .expect("Invalid API_PORT");
    let addr = format!("{}:{}", host, port);

    let listener = TcpListener::bind(&addr).await.unwrap_or_else(|e| {
        error!("Failed to bind to address {}: {}", addr, e);
        panic!("Exiting due to address binding failure.");
    });

    info!("API server listening on {}", addr);

    // Start the server and wait for it to run.
    axum::serve(listener, app)
        .await
        .unwrap_or_else(|e| {
            error!("API server crashed: {}", e);
            panic!("API server crashed.");
        });
}
