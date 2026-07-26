// import as `shared_logic::db`, `share_logic::models`.
pub mod bc;
pub mod db;
pub mod lsl;
pub mod mockeeg;
pub mod models;
pub use models::{NewUser, TimeSeriesData, User};
pub mod pipeline;
pub mod signal_processing;
