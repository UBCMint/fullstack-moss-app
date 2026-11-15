use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use axum::http::{header, HeaderMap, HeaderValue};
use axum::response::IntoResponse;
use axum::{
    body::Bytes,
    extract::Path,
    extract::Query,
    extract::State,
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use axum_extra::extract::cookie::{Cookie, CookieJar, SameSite};
use chrono::{DateTime, Utc};
use dotenvy::dotenv;
use log::{error, info};
use pyo3::types::{PyList, PyModule, PyTuple};
use pyo3::PyResult;
use pyo3::Python;
use pyo3::{IntoPy, ToPyObject};
use rand::RngCore;
use rand_core::OsRng;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::env;
use std::fs;
use tokio::net::TcpListener;

// shared logic library
use shared_logic::db::{
    export_eeg_data_as_csv, get_earliest_eeg_timestamp, get_eeg_data_by_range,
    get_time_labels_by_range, initialize_connection, DbClient,
};
use shared_logic::models::{
    EegDataQuery, EegDataRow, FrontendState, NewTimeLabel, NewUser, Session, TimeLabel,
};

// Argon2 imports
use argon2::{
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};

/// Name of the cookie that carries the session token.
const SESSION_COOKIE_NAME: &str = "moss_session";
/// How long a session stays valid after login.
const SESSION_TTL_DAYS: i64 = 7;

// Define application state
#[derive(Clone)]
struct AppState {
    db_client: DbClient,
}

/// Generates a random 32-byte session token, hex-encoded for use as a cookie value.
fn generate_session_token() -> String {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    hex::encode(bytes)
}

/// Hashes a session token with SHA-256 for storage. We only ever persist this
/// hash — never the raw token — so a leaked database can't be used to log in.
fn hash_session_token(token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    hex::encode(hasher.finalize())
}

/// Whether the incoming request's Host header is localhost, used to decide
/// whether the session cookie needs the `Secure` attribute.
fn is_localhost_request(headers: &HeaderMap) -> bool {
    headers
        .get(header::HOST)
        .and_then(|v| v.to_str().ok())
        .map(|host| {
            let host_without_port = host.split(':').next().unwrap_or(host);
            host_without_port == "localhost" || host_without_port == "127.0.0.1"
        })
        .unwrap_or(false)
}

/// Very small sanity check: one `@`, a non-empty local part, and a domain
/// part that contains a dot. Not a full RFC 5322 validator, just enough to
/// reject obviously malformed input before it reaches the database.
fn is_valid_email(email: &str) -> bool {
    let Some((local, domain)) = email.split_once('@') else {
        return false;
    };
    !local.is_empty()
        && !domain.is_empty()
        && domain.contains('.')
        && !domain.starts_with('.')
        && !domain.ends_with('.')
        && email.matches('@').count() == 1
        && !email.chars().any(char::is_whitespace)
}

/// Extracts the logged-in user's id from the `moss_session` cookie. Any
/// handler that takes this as a parameter automatically requires a valid,
/// non-expired session — Axum rejects the request with 401 otherwise.
struct AuthUser(i32);

#[axum::async_trait]
impl FromRequestParts<AppState> for AuthUser {
    type Rejection = (StatusCode, String);

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let jar = CookieJar::from_headers(&parts.headers);
        let token = jar
            .get(SESSION_COOKIE_NAME)
            .map(|c| c.value().to_string())
            .ok_or((StatusCode::UNAUTHORIZED, "Not logged in.".to_string()))?;

        let token_hash = hash_session_token(&token);

        let user_id = shared_logic::db::get_auth_session_user_id(&state.db_client, &token_hash)
            .await
            .map_err(|e| {
                error!("Failed to look up session: {}", e);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Failed to verify session.".to_string(),
                )
            })?
            .ok_or((
                StatusCode::UNAUTHORIZED,
                "Session expired or invalid.".to_string(),
            ))?;

        Ok(AuthUser(user_id))
    }
}

// define request struct for exporting EEG data
#[derive(Deserialize)]
struct ExportEEGRequest {
    filename: String,
    options: ExportOptions,
}

#[derive(Deserialize)]
pub struct ExportOptions {
    format: String,
    include_header: bool,
    start_time: Option<DateTime<Utc>>,
    end_time: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
struct PublicUser {
    id: i32,
    username: String,
    email: String,
}

/// Helper function for eeg data to get the start and end timestamps for a given session
///
/// Returns the start and end timestamps on success.
pub async fn get_eeg_time_range(
    client: &DbClient,
    session_id: i32,
    options: &ExportOptions,
) -> Result<(DateTime<Utc>, DateTime<Utc>), (StatusCode, String)> {
    // check for time range, else use defaults
    // for end time, we default to the current time
    // for start time, we default to the earliest timestamp for the session
    let end_time = match options.end_time {
        Some(t) => t,
        None => Utc::now(),
    };

    let start_time = match options.start_time {
        Some(t) => t,
        None => {
            // we call the helper function above to get the earliest timestamp
            match get_earliest_eeg_timestamp(client, session_id).await {
                Ok(Some(t)) => t,
                Ok(None) => {
                    return Err((
                        StatusCode::NOT_FOUND,
                        format!("No EEG data found for session {}", session_id),
                    ))
                }
                Err(e) => {
                    return Err((
                        StatusCode::INTERNAL_SERVER_ERROR,
                        format!("Failed to get earliest EEG timestamp: {}", e),
                    ))
                }
            }
        }
    };

    if start_time > end_time {
        return Err((
            StatusCode::BAD_REQUEST,
            "start_time cannot be after end_time".to_string(),
        ));
    }

    Ok((start_time, end_time))
}

// creates new user when POST /users is called
async fn create_user(
    State(app_state): State<AppState>,
    Json(new_user_data): Json<NewUser>,
) -> Result<Json<PublicUser>, (StatusCode, String)> {
    // Log only the email — NewUser deliberately doesn't derive Debug, since it
    // carries the raw password and a stray {:?} would leak it into the logs.
    info!("Received request to create user: {}", new_user_data.email);

    if !is_valid_email(&new_user_data.email) {
        return Err((
            StatusCode::BAD_REQUEST,
            "Please enter a valid email address.".to_string(),
        ));
    }
    if new_user_data.password.chars().count() < 8 {
        return Err((
            StatusCode::BAD_REQUEST,
            "Password must be at least 8 characters.".to_string(),
        ));
    }

    // Generate a random salt
    let salt = SaltString::generate(&mut OsRng);

    // Hash the password
    let argon2 = Argon2::default();
    let password_hash = argon2
        .hash_password(new_user_data.password.as_bytes(), &salt)
        .map_err(|e| {
            error!("Failed to hash password: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Password hashing failed".into(),
            )
        })?
        .to_string();

    // Store user in DB
    let created_user = match shared_logic::db::add_user(
        &app_state.db_client,
        new_user_data,
        password_hash,
    )
    .await
    {
        Ok(user) => user,
        Err(sqlx::Error::Database(db_err))
            if db_err.kind() == sqlx::error::ErrorKind::UniqueViolation =>
        {
            return Err((
                StatusCode::CONFLICT,
                "An account with that email or username already exists.".to_string(),
            ));
        }
        Err(e) => {
            error!("Failed to create user: {}", e);
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to create user.".to_string(),
            ));
        }
    };

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
    headers: HeaderMap,
    jar: CookieJar,
    Json(login_data): Json<LoginRequest>,
) -> Result<(CookieJar, Json<PublicUser>), (StatusCode, String)> {
    info!("Login attempt for email: {}", login_data.email);

    // Fetch user from DB by email
    let user =
        match shared_logic::db::get_user_by_email(&app_state.db_client, &login_data.email).await {
            Ok(u) => u,
            Err(_) => return Err((StatusCode::UNAUTHORIZED, "Invalid email or password".into())),
        };

    // Verify password
    let parsed_hash = PasswordHash::new(&user.password_hash).map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Password parsing failed".into(),
        )
    })?;

    if Argon2::default()
        .verify_password(login_data.password.as_bytes(), &parsed_hash)
        .is_err()
    {
        return Err((StatusCode::UNAUTHORIZED, "Invalid email or password".into()));
    }

    // Issue a new session: random token, store only its hash, cookie gets the raw token.
    let token = generate_session_token();
    let token_hash = hash_session_token(&token);
    let expires_at = Utc::now() + chrono::Duration::days(SESSION_TTL_DAYS);

    shared_logic::db::create_auth_session(&app_state.db_client, user.id, &token_hash, expires_at)
        .await
        .map_err(|e| {
            error!("Failed to create session: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to create session.".to_string(),
            )
        })?;

    let mut cookie = Cookie::new(SESSION_COOKIE_NAME, token);
    cookie.set_path("/");
    cookie.set_http_only(true);
    cookie.set_same_site(SameSite::Lax);
    cookie.set_max_age(time::Duration::days(SESSION_TTL_DAYS));
    if !is_localhost_request(&headers) {
        cookie.set_secure(true);
    }
    let jar = jar.add(cookie);

    let public_user = PublicUser {
        id: user.id,
        username: user.username,
        email: user.email,
    };
    Ok((jar, Json(public_user)))
}

async fn logout_user(
    State(app_state): State<AppState>,
    jar: CookieJar,
) -> Result<(CookieJar, StatusCode), (StatusCode, String)> {
    if let Some(cookie) = jar.get(SESSION_COOKIE_NAME) {
        let token_hash = hash_session_token(cookie.value());
        shared_logic::db::delete_auth_session(&app_state.db_client, &token_hash)
            .await
            .map_err(|e| {
                error!("Failed to delete session: {}", e);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Failed to log out.".to_string(),
                )
            })?;
    }

    // Must match the Path the cookie was set with, or the browser won't clear it.
    let mut removal_cookie = Cookie::from(SESSION_COOKIE_NAME);
    removal_cookie.set_path("/");
    let jar = jar.remove(removal_cookie);

    Ok((jar, StatusCode::OK))
}

async fn get_me(
    State(app_state): State<AppState>,
    AuthUser(user_id): AuthUser,
) -> Result<Json<PublicUser>, (StatusCode, String)> {
    let user = shared_logic::db::get_user_by_id(&app_state.db_client, user_id)
        .await
        .map_err(|e| {
            error!("Failed to fetch current user {}: {}", user_id, e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to fetch user.".to_string(),
            )
        })?;

    Ok(Json(PublicUser {
        id: user.id,
        username: user.username,
        email: user.email,
    }))
}

// Handler for POST /users/delete — deletes the logged-in user's own account.
// There is no way to pass another user's id here; AuthUser is the only
// source of which account gets deleted.
async fn delete_user(
    State(app_state): State<AppState>,
    AuthUser(user_id): AuthUser,
) -> Result<StatusCode, (StatusCode, String)> {
    match shared_logic::db::delete_user(&app_state.db_client, user_id).await {
        Ok(_) => {
            log::info!("User {} deleted their account", user_id);
            Ok(StatusCode::OK)
        }
        Err(e) => {
            log::error!("Failed to delete user {}: {}", user_id, e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to delete account.".to_string(),
            ))
        }
    }
}

/// Verifies `session_id` belongs to `user_id` before a handler touches its
/// data. "Doesn't exist" and "exists but isn't yours" both map to the same
/// 404 (never 403), so the response can't be used to enumerate other
/// users' session ids.
async fn ensure_session_owner(
    db: &DbClient,
    session_id: i32,
    user_id: i32,
) -> Result<(), (StatusCode, String)> {
    match shared_logic::db::require_session_owner(db, session_id, user_id).await {
        Ok(()) => Ok(()),
        Err(sqlx::Error::RowNotFound) => {
            Err((StatusCode::NOT_FOUND, "Session not found.".to_string()))
        }
        Err(e) => {
            error!("Failed to verify session ownership: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to verify session.".to_string(),
            ))
        }
    }
}

// Handler for POST /api/sessions
async fn create_session(
    State(app_state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Json(session_name): Json<String>,
) -> Result<Json<Session>, (StatusCode, String)> {
    info!("Received request to create session: {}", session_name);

    match shared_logic::db::create_session(&app_state.db_client, session_name, user_id).await {
        Ok(created_session) => {
            info!("Session created successfully: {:?}", created_session);
            Ok(Json(created_session))
        }
        Err(sqlx::Error::Database(db_err))
            if db_err.kind() == sqlx::error::ErrorKind::UniqueViolation =>
        {
            Err((
                StatusCode::CONFLICT,
                "You already have a session with that name.".to_string(),
            ))
        }
        Err(e) => {
            error!("Failed to create session: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to create session: {}", e),
            ))
        }
    }
}

// Handler for GET /api/sessions
async fn get_all_sessions(
    State(app_state): State<AppState>,
    AuthUser(user_id): AuthUser,
) -> Result<Json<Vec<Session>>, (StatusCode, String)> {
    info!("Received request to get all sessions");

    match shared_logic::db::get_sessions(&app_state.db_client, user_id).await {
        Ok(sessions) => {
            info!("Retrieved {} sessions.", sessions.len());
            Ok(Json(sessions))
        }
        Err(e) => {
            error!("Failed to retrieve sessions: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to retrieve sessions: {}", e),
            ))
        }
    }
}

// Handler for POST /api/sessions/{session_id}/frontend-state
async fn set_frontend_state(
    State(app_state): State<AppState>,
    Path(session_id): Path<i32>,
    AuthUser(user_id): AuthUser,
    Json(state_data): Json<Value>,
) -> Result<Json<FrontendState>, (StatusCode, String)> {
    info!(
        "Received request to set frontend state for session {}",
        session_id
    );

    ensure_session_owner(&app_state.db_client, session_id, user_id).await?;

    match shared_logic::db::upsert_frontend_state(&app_state.db_client, session_id, state_data)
        .await
    {
        Ok(state) => {
            info!("Frontend state set successfully for session {}", session_id);
            Ok(Json(state))
        }
        Err(e) => {
            error!("Failed to set frontend state: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to set frontend state: {}", e),
            ))
        }
    }
}

// Handler for  GET /api/sessions/{session_id}/frontend-state
async fn get_frontend_state(
    State(app_state): State<AppState>,
    Path(session_id): Path<i32>,
    AuthUser(user_id): AuthUser,
) -> Result<Json<Value>, (StatusCode, String)> {
    info!(
        "Received request to get frontend state for session {}",
        session_id
    );

    ensure_session_owner(&app_state.db_client, session_id, user_id).await?;

    match shared_logic::db::get_frontend_state(&app_state.db_client, session_id).await {
        Ok(Some(v)) => {
            info!(
                "Frontend state retrieved successfully for session {}",
                session_id
            );
            Ok(Json(v))
        }
        Ok(None) => Err((
            StatusCode::NOT_FOUND,
            format!("No frontend state found for session {}", session_id),
        )),
        Err(e) => {
            error!("Failed to get frontend state: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to get frontend state: {}", e),
            ))
        }
    }
}

// Handler for POST /api/sessions/{session_id}/eeg_data/export
async fn export_eeg_data(
    State(app_state): State<AppState>,
    Path(session_id): Path<i32>,
    AuthUser(user_id): AuthUser,
    Json(request): Json<ExportEEGRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    info!(
        "Received request to export EEG data for session {}",
        session_id
    );

    ensure_session_owner(&app_state.db_client, session_id, user_id).await?;

    // right now the only export format supported is CSV, so we just check for that
    if request.options.format.to_lowercase() != "csv" {
        return Err((
            StatusCode::BAD_REQUEST,
            format!("Unsupported export format: {}", request.options.format),
        ));
    }

    let (start_time, end_time) =
        get_eeg_time_range(&app_state.db_client, session_id, &request.options).await?;

    let header_included = request.options.include_header;

    // finally call the export function in db.rs
    let return_csv = match export_eeg_data_as_csv(
        &app_state.db_client,
        session_id,
        start_time,
        end_time,
        header_included,
    )
    .await
    {
        Ok(csv_data) => csv_data,
        Err(e) => {
            error!("Failed to export EEG data: {}", e);
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to export EEG data: {}", e),
            ));
        }
    };

    // small safety: avoid quotes breaking header
    let filename = request.filename.replace('"', "");

    let mut headers = HeaderMap::new();
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("text/csv; charset=utf-8"),
    );

    let content_disp = format!("attachment; filename=\"{}\"", filename);
    headers.insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_str(&content_disp).map_err(|e| {
            (
                StatusCode::BAD_REQUEST,
                format!("Invalid filename for header: {}", e),
            )
        })?,
    );

    // return CSV directly as the body
    Ok((headers, return_csv))
}

// Handler for POST /api/sessions/{session_id}/time-label
// Receives a batch of time labels from the frontend after a session ends and stores them in the DB.
async fn store_time_labels(
    State(app_state): State<AppState>, // DB connection pool
    Path(session_id): Path<i32>,       // session ID from the URL path
    AuthUser(user_id): AuthUser,
    Json(labels): Json<Vec<NewTimeLabel>>, // array of {timestamp, label} objects from the request body
) -> Result<StatusCode, (StatusCode, String)> {
    info!(
        "Received request to store {} time labels for session {}",
        labels.len(),
        session_id
    );

    ensure_session_owner(&app_state.db_client, session_id, user_id).await?;

    match shared_logic::db::insert_time_labels(&app_state.db_client, session_id, labels).await {
        Ok(_) => {
            info!("Time labels stored successfully for session {}", session_id);
            Ok(StatusCode::CREATED) // 201 — write-only, nothing to return
        }
        Err(e) => {
            error!("Failed to store time labels: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to store time labels: {}", e),
            ))
        }
    }
}

// Handler for GET /api/sessions/{session_id}/time-label
// Returns time labels within a given time range (passed as ?start=...&end=... query params).
async fn get_time_labels(
    State(app_state): State<AppState>,
    Path(session_id): Path<i32>,
    Query(params): Query<EegDataQuery>,
    AuthUser(user_id): AuthUser,
) -> Result<Json<Vec<TimeLabel>>, (StatusCode, String)> {
    info!(
        "Received request to get time labels for session {} from {} to {}",
        session_id, params.start, params.end
    );

    ensure_session_owner(&app_state.db_client, session_id, user_id).await?;

    match get_time_labels_by_range(&app_state.db_client, session_id, params.start, params.end).await
    {
        Ok(labels) => {
            info!("Retrieved {} time labels", labels.len());
            Ok(Json(labels))
        }
        Err(e) => {
            error!("Failed to get time labels: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to get time labels: {}", e),
            ))
        }
    }
}

// Handler for GET /api/sessions/{session_id}/eeg-data
// Returns EEG data rows within a given time range (passed as ?start=...&end=... query params).
async fn get_eeg_data(
    State(app_state): State<AppState>,  // DB connection pool
    Path(session_id): Path<i32>,        // session ID from the URL path
    Query(params): Query<EegDataQuery>, // ?start=...&end=... parsed into EegDataQuery struct
    AuthUser(user_id): AuthUser,
) -> Result<Json<Vec<EegDataRow>>, (StatusCode, String)> {
    info!(
        "Received request to get EEG data for session {} from {} to {}",
        session_id, params.start, params.end
    );

    ensure_session_owner(&app_state.db_client, session_id, user_id).await?;

    match get_eeg_data_by_range(&app_state.db_client, session_id, params.start, params.end).await {
        Ok(rows) => {
            info!("Retrieved {} EEG data rows", rows.len());
            Ok(Json(rows))
        }
        Err(e) => {
            error!("Failed to get EEG data: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to get EEG data: {}", e),
            ))
        }
    }
}

// Handler for POST /api/sessions/{session_id}/eeg_data/import
async fn import_eeg_data(
    State(app_state): State<AppState>,
    Path(session_id): Path<i32>,
    AuthUser(user_id): AuthUser,
    // we expect the CSV data to be sent as raw text in the body of the request
    body: Bytes,
) -> Result<Json<Value>, (StatusCode, String)> {
    ensure_session_owner(&app_state.db_client, session_id, user_id).await?;

    shared_logic::db::import_eeg_data_from_csv(&app_state.db_client, session_id, &body)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to import EEG data: {}", e),
            )
        })?;

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
    })
    .await
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Python blocking task failed: {}", e),
        )
    })?;

    match result {
        Ok(s) => Ok(Json(json!({"python_output": s}))),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Python script execution failed: {}", e),
        )),
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
        .route("/users/login", post(login_user))
        .route("/users/logout", post(logout_user))
        .route("/users/me", get(get_me))
        .route("/users/delete", post(delete_user))
        .route("/run-python-script", get(run_python_script_handler))
        .route("/api/sessions", post(create_session))
        .route("/api/sessions", get(get_all_sessions))
        .route(
            "/api/sessions/:session_id/frontend-state",
            post(set_frontend_state),
        )
        .route(
            "/api/sessions/:session_id/frontend-state",
            get(get_frontend_state),
        )
        .route(
            "/api/sessions/:session_id/time-label",
            post(store_time_labels),
        )
        .route("/api/sessions/:session_id/time-label", get(get_time_labels))
        .route("/api/sessions/:session_id/eeg-data", get(get_eeg_data))
        .route(
            "/api/sessions/:session_id/eeg_data/export",
            post(export_eeg_data),
        )
        .route(
            "/api/sessions/:session_id/eeg_data/import",
            post(import_eeg_data),
        )
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
    axum::serve(listener, app).await.unwrap_or_else(|e| {
        error!("API server crashed: {}", e);
        panic!("API server crashed.");
    });
}
