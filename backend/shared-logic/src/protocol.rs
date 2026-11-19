//! Error frame sent to the client when a session can't start:
//! `{"type": "error", "code": "...", "message": "...", "node_id": "..."}`.
//! See `backend/docs/websocket-protocol.md`.

use serde::Serialize;

use crate::pipeline::PipelineError;

#[derive(Serialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    InvalidMessage,
    InvalidPipeline,
    NoSource,
    PipelineInitFailed,
    InternalError,
}

#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct ClientError {
    #[serde(rename = "type")]
    kind: &'static str,
    pub code: ErrorCode,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub node_id: Option<String>,
}

impl ClientError {
    pub fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        Self {
            kind: "error",
            code,
            message: message.into(),
            node_id: None,
        }
    }

    pub fn to_json(&self) -> String {
        serde_json::to_string(self).expect("ClientError always serializes")
    }
}

impl From<PipelineError> for ClientError {
    fn from(e: PipelineError) -> Self {
        Self {
            node_id: e.node_id,
            ..Self::new(ErrorCode::InvalidPipeline, e.message)
        }
    }
}

impl std::fmt::Display for ClientError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{:?}: {}", self.code, self.message)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_as_error_frame() {
        let e: ClientError = PipelineError::at("f1", "Bad cutoff.").into();
        assert_eq!(
            e.to_json(),
            r#"{"type":"error","code":"invalid_pipeline","message":"Bad cutoff.","node_id":"f1"}"#
        );
        assert_eq!(
            ClientError::new(ErrorCode::NoSource, "none").to_json(),
            r#"{"type":"error","code":"no_source","message":"none"}"#
        );
    }
}
