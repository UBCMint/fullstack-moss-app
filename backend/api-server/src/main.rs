use axum::{
    extract::State,
    extract::Path,
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
use std::env;
use std::fs;
use pyo3::Python;
use pyo3::types::{PyList, PyModule, PyTuple};
use pyo3::PyResult;
use pyo3::{IntoPy, ToPyObject};

// shared logic library
use shared_logic::db::{initialize_connection, DbClient};
use shared_logic::models::{User, NewUser, UpdateUser};

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
