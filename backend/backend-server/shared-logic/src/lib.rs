// import as `shared_logic::db`, `share_logic::models`.
pub mod db;
pub mod models;
pub mod bc;
pub mod mockeeg;
pub mod lsl;
pub use models::{User, TimeSeriesData, NewUser};