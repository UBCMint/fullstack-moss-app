// Matches Rust's shared_logic::models::User
export interface User {
  id: number;
  username: string;
  email: string;
}

// Matches Rust's shared_logic::models::NewUser
export interface NewUser {
  username: string;
  email: string;
}

// Matches Rust's shared_logic::models::TimeSeriesData
export interface TimeSeriesData {
  id: number;
  timestamp: string; // Rust sends/receives as DateTime<Utc>, which serializes to RFC3339 string
  value: number;
  metadata?: string; // Optional metadata field
}