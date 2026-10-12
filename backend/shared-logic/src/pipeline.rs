//! Client-configured processing pipeline, sent as `nodes` in the websocket init message.
//!
//! Each [`Node`] is serialized adjacently tagged as `{"type": "...", "config": {...}}`, with
//! `type` one of `"window"`, `"preprocessing"` or `"ml"`. The backend doesn't run the
//! nodes as a graph. It looks up the first node of each type with the accessors on
//! [`Pipeline`], and falls back to `Default` when a type is missing.
//!
//! None of the config structs use `#[serde(default)]`, so every non-`Option` field is
//! required whenever its node is present. One missing field rejects the whole init message.
//!
//! This module is the contract the frontend node editor
//! (`frontend/components/ui-react-flow/react-flow-view.tsx`) has to match. Field-by-field
//! spec: `backend/docs/pipeline-nodes.md`.

use serde::{Deserialize, Serialize};

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct Pipeline {
    pub nodes: Vec<Node>,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
#[serde(tag = "type", content = "config")]
pub enum Node {
    #[serde(rename = "window")]
    Window(WindowConfig),

    #[serde(rename = "preprocessing")]
    Preprocessing(PreprocessingConfig),

    #[serde(rename = "ml")]
    ML(MLConfig),
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct WindowConfig {
    pub chunk_size: usize,
    pub overlap_size: usize,
}

impl Default for WindowConfig {
    fn default() -> Self {
        Self {
            chunk_size: 64,
            overlap_size: 0,
        }
    }
}

// Fields moved from ProcessingConfig in lsl.rs
#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct PreprocessingConfig {
    pub apply_bandpass: bool,
    pub apply_quality_check: bool,
    pub use_iir: bool,
    pub l_freq: Option<f32>,
    pub h_freq: Option<f32>,
    pub downsample_factor: Option<u32>,
    pub sfreq: f32,
    pub n_channels: usize,
}

impl Default for PreprocessingConfig {
    fn default() -> Self {
        Self {
            apply_bandpass: true,
            apply_quality_check: true,
            use_iir: false,
            l_freq: Some(1.0),
            h_freq: Some(50.0),
            downsample_factor: None,
            sfreq: 256.0,
            n_channels: 4,
        }
    }
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct MLConfig {
    pub model: String,
}

impl Pipeline {
    pub fn window_config(&self) -> Option<&WindowConfig> {
        self.nodes.iter().find_map(|n| {
            if let Node::Window(c) = n {
                Some(c)
            } else {
                None
            }
        })
    }

    pub fn preprocessing_config(&self) -> Option<&PreprocessingConfig> {
        self.nodes.iter().find_map(|n| {
            if let Node::Preprocessing(c) = n {
                Some(c)
            } else {
                None
            }
        })
    }

    pub fn ml_config(&self) -> Option<&MLConfig> {
        self.nodes
            .iter()
            .find_map(|n| if let Node::ML(c) = n { Some(c) } else { None })
    }
}
