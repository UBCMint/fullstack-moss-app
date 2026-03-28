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
    pub size: usize,
}

// Fields moved from ProcessingConfig in lsl.rs
#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct PreprocessingConfig {
    pub apply_bandpass: bool,
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
            if let Node::Window(c) = n { Some(c) } else { None }
        })
    }

    pub fn preprocessing_config(&self) -> Option<&PreprocessingConfig> {
        self.nodes.iter().find_map(|n| {
            if let Node::Preprocessing(c) = n { Some(c) } else { None }
        })
    }

    pub fn ml_config(&self) -> Option<&MLConfig> {
        self.nodes.iter().find_map(|n| {
            if let Node::ML(c) = n { Some(c) } else { None }
        })
    }
}
