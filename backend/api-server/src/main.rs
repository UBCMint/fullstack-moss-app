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
use rand_core::OsRng;

// shared logic library
use shared_logic::db::{initialize_connection, DbClient};
use shared_logic::models::{User, NewUser, UpdateUser, Session, FrontendState, PublicUser};

// Argon2 imports
use argon2::{
    Argon2,
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
};


// Define application state
#[derive(Clone)]
struct AppState {
    db_client: DbClient,
}


#[derive(Debug, Clone, Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
struct DeleteUserRequest {
    id: i32,
}

// creates new user when POST /users is called
async fn create_user(
    State(app_state): State<AppState>,
    Json(new_user_data): Json<NewUser>,
) -> Result<Json<PublicUser>, (StatusCode, String)> {
    info!("Received request to create user: {:?}", new_user_data);

    // Generate a random salt
    let salt = SaltString::generate(&mut OsRng);

    // Hash the password
    let argon2 = Argon2::default();
    let password_hash = argon2
        .hash_password(new_user_data.password.as_bytes(), &salt)
        .map_err(|e| {
            error!("Failed to hash password: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, "Password hashing failed".into())
        })?
        .to_string();

    // Store user in DB
    let created_user = shared_logic::db::add_user(
        &app_state.db_client,
        new_user_data,
        password_hash,
    )
    .await
    .map_err(|e| {
        error!("Failed to create user: {}", e);
        (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to create user: {}", e))
    })?;

    // Convert to PublicUser to hide password
    let public_user = PublicUser {
        id: created_user.id,
        username: created_user.username,
        email: created_user.email,
    };

    info!("User created successfully: {:?}", public_user);
    Ok(Json(public_user))
}



async fn login_user(
    State(app_state): State<AppState>,
    Json(login_data): Json<LoginRequest>,
) -> Result<Json<PublicUser>, (StatusCode, String)> {
    info!("Login attempt for email: {}", login_data.email);

    // Fetch user from DB by email
    let user = match shared_logic::db::get_user_by_email(&app_state.db_client, &login_data.email).await {
        Ok(u) => u,
        Err(_) => return Err((StatusCode::UNAUTHORIZED, "Invalid email or password".into())),
    };

    // Verify password
    let parsed_hash = PasswordHash::new(&user.password_hash)
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "Password parsing failed".into()))?;

    if Argon2::default().verify_password(login_data.password.as_bytes(), &parsed_hash).is_ok() {
        let public_user = PublicUser {
            id: user.id,
            username: user.username,
            email: user.email,
        };
        Ok(Json(public_user))
    } else {
        Err((StatusCode::UNAUTHORIZED, "Invalid email or password".into()))
    }
}


// Handler for GET /users
// This function will retrieve all users from the database.
async fn get_all_users(
    State(app_state): State<AppState>,
) -> Result<Json<Vec<PublicUser>>, (StatusCode, String)> {
    info!("Received request to get all users");

    let users = shared_logic::db::get_users(&app_state.db_client).await.map_err(|e| {
        error!("Failed to retrieve users: {}", e);
        (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to retrieve users: {}", e))
    })?;

    Ok(Json(users))
}

// Handler for DELETE /users
async fn delete_user(
    State(app_state): State<AppState>,
    Json(payload): Json<DeleteUserRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    let user_id = payload.id;

    match shared_logic::db::delete_user(&app_state.db_client, user_id).await {
        Ok(_) => {
            log::info!("User {} deleted successfully", user_id);
            Ok(StatusCode::OK)
        }
        Err(e) => {
            log::error!("Failed to delete user {}: {}", user_id, e);
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
        .route("/users/login", post(login_user))     // Login route
        .route("/users", get(get_all_users))
        .route("/users/delete", post(delete_user))     //
        .route("/run-python-script", get(run_python_script_handler))
        
        .route("/api/sessions", post(create_session))
        .route("/api/sessions", get(get_all_sessions))
        
        .route("/api/sessions/:session_id/frontend-state", post(set_frontend_state))
        .route("/api/sessions/:session_id/frontend-state", get(get_frontend_state))

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
