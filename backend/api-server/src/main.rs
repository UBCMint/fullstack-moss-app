use axum::{
    extract::State,
    extract::Path,
    http::StatusCode,
    routing::{get, post},
    Json,
    Router,
    body::Bytes,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::net::TcpListener;
use log::{info, error};
use dotenvy::dotenv;
use std::env;
use std::fs;
use pyo3::Python;
use pyo3::types::{PyList, PyModule, PyTuple};
use pyo3::PyResult;
use pyo3::{IntoPy, ToPyObject};
use chrono::{DateTime, Utc};
use axum::http::{HeaderMap, HeaderValue, header};
use axum::response::IntoResponse;

// shared logic library
use shared_logic::db::{initialize_connection, DbClient};
use shared_logic::models::{User, NewUser, UpdateUser, Session, FrontendState};

// Define application state
#[derive(Clone)]
struct AppState {
    db_client: DbClient,
}

// define request struct for exporting EEG data
#[derive(Deserialize)]
struct ExportEEGRequest {
    filename: String,
    options: ExportOptions
}

#[derive(Deserialize)]
struct ExportOptions {
    format: String,
    includeHeader: bool,
    start_time: Option<DateTime<Utc>>,
    end_time: Option<DateTime<Utc>>,
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

// Handler for PUT /users/:id
async fn update_user(
    State(app_state): State<AppState>,
    Path(id): Path<i32>,
    Json(update_data): Json<UpdateUser>,
) -> Result<Json<User>, (StatusCode, String)> {
    info!("Received request to update user {}: {:?}", id, update_data);

    match shared_logic::db::update_user(&app_state.db_client, id, update_data).await {
        Ok(user) => {
            info!("User updated successfully: {:?}", user);
            Ok(Json(user))
        }
        Err(e) => {
            error!("Failed to update user: {}", e);
            Err((StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to update user: {}", e)))
        }
    }
}

// Handler for DELETE /users/:id
async fn delete_user(
    State(app_state): State<AppState>,
    Path(id): Path<i32>,
) -> Result<StatusCode, (StatusCode, String)> {
    info!("Received request to delete user {}", id);

    match shared_logic::db::delete_user(&app_state.db_client, id).await {
        Ok(_) => {
            info!("User {} deleted", id);
            Ok(StatusCode::NO_CONTENT)
        }
        Err(e) => {
            error!("Failed to delete user: {}", e);
            Err((StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to delete user: {}", e)))
        }
    }
}


// Handler for POST /api/sessions
async fn create_session(
    State(app_state): State<AppState>,
    Json(session_name): Json<String>,
) -> Result<Json<Session>, (StatusCode, String)> {
    info!("Received request to create session: {}", session_name);

    match shared_logic::db::create_session(&app_state.db_client, session_name).await {
        Ok(created_session) => {
            info!("Session created successfully: {:?}", created_session);
            Ok(Json(created_session))
        }
        Err(e) => {
            error!("Failed to create session: {}", e);
            Err((StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to create session: {}", e)))
        }
    }
}

// Handler for GET /api/sessions
async fn get_all_sessions(
    State(app_state): State<AppState>,
) -> Result<Json<Vec<Session>>, (StatusCode, String)> {
    info!("Received request to get all sessions");

    match shared_logic::db::get_sessions(&app_state.db_client).await {
        Ok(sessions) => {
            info!("Retrieved {} sessions.", sessions.len());
            Ok(Json(sessions))
        }
        Err(e) => {
            error!("Failed to retrieve sessions: {}", e);
            Err((StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to retrieve sessions: {}", e)))
        }
    }
}

// Handler for POST /api/sessions/{session_id}/frontend-state
async fn set_frontend_state(
    State(app_state): State<AppState>,
    Path(session_id): Path<i32>,
    Json(state_data): Json<Value>,
) -> Result<Json<FrontendState>, (StatusCode, String)> {
    info!("Received request to set frontend state for session {}", session_id);

    match shared_logic::db::upsert_frontend_state(&app_state.db_client, session_id, state_data).await {
        Ok(state) => {
            info!("Frontend state set successfully for session {}", session_id);
            Ok(Json(state))
        }
        Err(e) => {
            error!("Failed to set frontend state: {}", e);
            Err((StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to set frontend state: {}", e)))
        }
    }
}

// Handler for  GET /api/sessions/{session_id}/frontend-state
async fn get_frontend_state(
    State(app_state): State<AppState>,
    Path(session_id): Path<i32>,
) -> Result<Json<Value>, (StatusCode, String)> {
    info!("Received request to get frontend state for session {}", session_id);

    match shared_logic::db::get_frontend_state(&app_state.db_client, session_id).await {
        Ok(Some(v)) => {
            info!("Frontend state retrieved successfully for session {}", session_id);
            Ok(Json(v))
        }
        Ok(None) => { Err((StatusCode::NOT_FOUND, format!("No frontend state found for session {}", session_id))) },
        Err(e) => {
            error!("Failed to get frontend state: {}", e);
            Err((StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to get frontend state: {}", e)))
        }
    }
}

// Handler for POST /api/sessions/{session_id}/eeg_data/export
async fn export_eeg_data(
    State(app_state): State<AppState>,
    Path(session_id): Path<i32>,
    Json(request): Json<ExportEEGRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    info!("Received request to export EEG data for session {}", session_id);

    // right now the only export format supported is CSV, so we just check for that
    if request.options.format.to_lowercase() != "csv" {
        return Err((StatusCode::BAD_REQUEST, format!("Unsupported export format: {}", request.options.format)));
    }

    // check for time range, else use defaults
    // for end time, we default to the current time
    // for start time, we default to the earliest timestamp for the session
    let end_time = match request.options.end_time {
        Some(t) => t,
        None => Utc::now(),
    };

    let start_time = match request.options.start_time {
        Some(t) => t,
        None => {
            // we call the helper function in db.rs to get the earliest timestamp
            match shared_logic::db::get_earliest_eeg_timestamp(&app_state.db_client, session_id).await {
                Ok(Some(t)) => t,
                Ok(None) => return Err((StatusCode::NOT_FOUND, format!("No EEG data found for session {}", session_id))),
                Err(e) => return Err((StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to get earliest EEG timestamp: {}", e))),
            }
        }
    };

    if start_time > end_time {
        return Err((StatusCode::BAD_REQUEST, "start_time cannot be after end_time".to_string()));
    }

    let header_included = request.options.includeHeader;

    // finally call the export function in db.rs
    let return_csv = match shared_logic::db::export_eeg_data_as_csv(&app_state.db_client, session_id, start_time, end_time, header_included).await {
        Ok(csv_data) => csv_data,
        Err(e) => {
            error!("Failed to export EEG data: {}", e);
            return Err((StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to export EEG data: {}", e)));
        }
    };

    // small safety: avoid quotes breaking header
    let filename = request.filename.replace('"', "");

    let mut headers = HeaderMap::new();
    headers.insert(header::CONTENT_TYPE, HeaderValue::from_static("text/csv; charset=utf-8"));

    let content_disp = format!("attachment; filename=\"{}\"", filename);
    headers.insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_str(&content_disp).map_err(|e| {
            (StatusCode::BAD_REQUEST, format!("Invalid filename for header: {}", e))
        })?,
    );

    // return CSV directly as the body
    Ok((headers, return_csv))
        
}

// Handler for POST /api/sessions/{session_id}/eeg_data/import
async fn import_eeg_data(
    State(app_state): State<AppState>,
    Path(session_id): Path<i32>,
    // we expect the CSV data to be sent as raw text in the body of the request
    body: Bytes,
) -> Result<Json<Value>, (StatusCode, String)> {
    shared_logic::db::import_eeg_data_from_csv(&app_state.db_client, session_id, &body)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to import EEG data: {}", e)))?;

    Ok(Json(json!({"status": "success"})))
}

async fn run_python_script_handler() -> Result<Json<Value>, (StatusCode, String)> {
    info!("Received request to run Python script.");

    // Python::with_gil needs to be run in a blocking context for async Rust
    let result = tokio::task::spawn_blocking(move || {
        Python::with_gil(|py| {
            // Get the current working directory of the API server executable
            let current_dir = env::current_dir()?;
            info!("API Server CWD for Python scripts: {:?}", current_dir);

            // Adjust Python script directory to sys.path
            // Assuming 'python' and 'scripts' folders are at the workspace root level
            // relative to the `api-server` crate, it would be `../python` and `../scripts`.
            // When running `cargo run -p api-server` from `backend-server`,
            // the CWD is `backend-server`. So paths are relative to that.
            let sys = py.import("sys")?;
            let paths: &PyList = sys.getattr("path")?.downcast()?;
            
            // Add the directory containing your EyeBlink Python source
            // This path is relative to the backend-server/ directory
            paths.insert(0, "./python/EyeBlink/src")?; 
            info!("Added './python/EyeBlink/src' to Python sys.path");

            // Read and execute test.py
            let test_py_path = "./python/EyeBlink/src/test.py";
            let test_py_src = fs::read_to_string(test_py_path)?;
            PyModule::from_code(py, &test_py_src, "test.py", "__main__")?;
            info!("Executed test.py");

            // Read and execute hello.py
            let hello_py_path = "./scripts/hello.py";
            let hello_py_src = fs::read_to_string(hello_py_path)?;
            let module = PyModule::from_code(py, &hello_py_src, "hello.py", "hello")?;
            info!("Loaded hello.py module");

            // Call the 'test' function from hello.py
            let greet_func = module.getattr("test")?.to_object(py);
            let args = PyTuple::new(py, &[20_i32.into_py(py), 30_i32.into_py(py)]);
            let py_result = greet_func.call1(py, args)?;

            let result_str: String = py_result.extract(py)?;
            info!("Result from Python: {}", result_str);

            Ok(result_str) as PyResult<String>
        })
    }).await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Python blocking task failed: {}", e)))?;

    match result {
        Ok(s) => Ok(Json(json!({"python_output": s}))),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, format!("Python script execution failed: {}", e))),
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
        .route("/users/:id", axum::routing::put(update_user))
        .route("/users/:id", axum::routing::delete(delete_user))
        .route("/run-python-script", get(run_python_script_handler))
        
        .route("/api/sessions", post(create_session))
        .route("/api/sessions", get(get_all_sessions))
        
        .route("/api/sessions/:session_id/frontend-state", post(set_frontend_state))
        .route("/api/sessions/:session_id/frontend-state", get(get_frontend_state))

        .route("/api/sessions/:session_id/eeg_data/export", post(export_eeg_data))
        .route("/api/sessions/:session_id/eeg_data/import", post(import_eeg_data))

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
