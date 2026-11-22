// import as `shared_logic::db`, `share_logic::models`.
pub mod bc;
pub mod channels;
pub mod db;
pub mod lsl;
pub mod mockeeg;
pub mod models;
pub mod packet;
pub use models::{NewUser, TimeSeriesData, User};
pub mod pipeline;
pub mod signal_processing;
