#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use serde_json::json;
use log::{info, error};
use dotenvy::dotenv;
use std::path::PathBuf;
use reqwest;
use chrono::TimeZone;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct User {
    pub id: i32,
    pub username: String,
    pub email: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct NewUser {
    pub username: String,
    pub email: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimeSeriesData {
    pub id: i32,
    pub timestamp: String,
    pub value: f64,
    pub metadata: Option<String>,
}

#[tauri::command]
async fn run_python_script() -> Result<String, String> {
    let api_base_url = std::env::var("API_SERVER_URL").unwrap_or_else(|_| "http://localhost:9000".to_string());
    let client = reqwest::Client::new();

    info!("Tauri: Sending GET request to {}/run-python-script", api_base_url);

    let res = client.get(&format!("{}/run-python-script", api_base_url))
        .send()
        .await
        .map_err(|e| format!("Failed to send request: {}", e))?;

    if res.status().is_success() {
        let data: serde_json::Value = res.json().await.map_err(|e| format!("Failed to parse response: {}", e))?;
        let python_output = data["python_output"].as_str().unwrap_or("").to_string();
        info!("Tauri: Python script executed successfully via API. Output: {}", python_output);
        Ok(format!("Python script output: {}", python_output))
    } else {
        let status = res.status();
        let error_text = res.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        error!("Tauri: API returned error status {}: {}", status, error_text);
        Err(format!("API error: {}", error_text))
    }
}


#[tauri::command]
async fn add_user_command(username: String, email: String) -> Result<User, String> {
    println!("Testing");
    let api_base_url = std::env::var("API_SERVER_URL").unwrap_or_else(|_| "http://localhost:9000".to_string());
    let client = reqwest::Client::new();
    let new_user_data = NewUser { username, email };

    info!("Tauri: Sending POST request to {}/users with {:?}", api_base_url, new_user_data);

    let res = client.post(&format!("{}/users", api_base_url))
        .json(&new_user_data)
        .send()
        .await
        .map_err(|e| format!("Failed to send request: {}", e))?;

    if res.status().is_success() {
        let user: User = res.json().await.map_err(|e| format!("Failed to parse response: {}", e))?;
        info!("Tauri: User added successfully via API: {:?}", user);
        Ok(user)
    } else {
        let status = res.status();
        let error_text = res.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        error!("Tauri: API returned error status {}: {}", status, error_text);
        Err(format!("API error: {}", error_text))
    }
}

#[tauri::command]
async fn get_users_command() -> Result<Vec<User>, String> {
    let api_base_url = std::env::var("API_SERVER_URL").unwrap_or_else(|_| "http://localhost:9000".to_string());
    let client = reqwest::Client::new();

    info!("Tauri: Sending GET request to {}/users", api_base_url);

    let res = client.get(&format!("{}/users", api_base_url))
        .send()
        .await
        .map_err(|e| format!("Failed to send request: {}", e))?;

    if res.status().is_success() {
        let users: Vec<User> = res.json().await.map_err(|e| format!("Failed to parse response: {}", e))?;
        info!("Tauri: Retrieved {} users via API.", users.len());
        Ok(users)
    } else {
        let status = res.status();
        let error_text = res.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        error!("Tauri: API returned error status {}: {}", status, error_text);
        Err(format!("API error: {}", error_text))
    }
}

#[tauri::command]
async fn add_time_series_data_command(
    timestamp_millis: i64,
    value: f64,
    metadata: String
) -> Result<String, String> {
    let api_base_url = std::env::var("API_SERVER_URL").unwrap_or_else(|_| "http://localhost:9000".to_string());
    let client = reqwest::Client::new();


    let dt: chrono::DateTime<chrono::Utc> = chrono::Utc
        .timestamp_millis_opt(timestamp_millis)
        .single()
        .ok_or_else(|| "Invalid timestamp".to_string())?;

    let payload = json!({
        "timestamp": dt.to_rfc3339(),
        "value": value,
        "metadata": metadata,
    });

    info!("Tauri: Sending POST request to {}/timeseries with {:?}", api_base_url, payload);

    let res = client.post(&format!("{}/timeseries", api_base_url))
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Failed to send request: {}", e))?;

    if res.status().is_success() {
        info!("Tauri: Time series data added successfully via API.");
        Ok("Time series data added successfully".to_string())
    } else {
        let status = res.status();
        let error_text = res.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        error!("Tauri: API returned error status {}: {}", status, error_text);
        Err(format!("API error: {}", error_text))
    }
}

#[tauri::command]
async fn get_time_series_data_command() -> Result<Vec<TimeSeriesData>, String> {
    let api_base_url = std::env::var("API_SERVER_URL").unwrap_or_else(|_| "http://localhost:9000".to_string());
    let client = reqwest::Client::new();

    info!("Tauri: Sending GET request to {}/timeseries", api_base_url);

    let res = client.get(&format!("{}/timeseries", api_base_url))
        .send()
        .await
        .map_err(|e| format!("Failed to send request: {}", e))?;

    if res.status().is_success() {
        let data: Vec<TimeSeriesData> = res.json().await.map_err(|e| format!("Failed to parse response: {}", e))?;
        info!("Tauri: Retrieved {} time series data points via API.", data.len());
        Ok(data)
    } else {
        let status = res.status();
        let error_text = res.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        error!("Tauri: API returned error status {}: {}", status, error_text);
        Err(format!("API error: {}", error_text))
    }
}

// used in websocket_code.rs (legacy code)
#[tauri::command]
async fn select_model(filter: String, model_type: String) -> Result<String, String> {
    Ok(format!("Selected model with filter '{}' and type '{}'", filter, model_type))
}

fn main() {
    // Load environment variables for the Tauri app
    let mut app_env_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    app_env_path.push(".env");

    if app_env_path.exists() {
        dotenvy::from_path(app_env_path.as_path()).ok();
        println!("Loaded environment variables from {:?}", app_env_path);
    } else {
        dotenv().ok();
        println!("No specific .env found at {:?}, falling back to default dotenv search.", app_env_path);
    }

    // Initialize logging AFTER loading .env
    env_logger::init();
    info!("Starting Tauri application...");
    info!("Environment variables loaded for Tauri app.");

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            select_model,
            add_user_command,
            get_users_command,
            add_time_series_data_command,
            get_time_series_data_command,
            run_python_script,
        ])
        .setup(|_app| {
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
