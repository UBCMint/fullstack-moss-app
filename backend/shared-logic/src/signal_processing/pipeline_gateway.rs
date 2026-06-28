use numpy::PyArray2;
use pyo3::prelude::*;
use pyo3::types::{PyDict, PyList, PyModule};
use serde::{Deserialize, Serialize};

use crate::lsl::ProcessingConfig;

pub struct PipelineGateway {
    manager_module: Py<PyModule>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PipelineOutput {
    pub overall_label: String,
    pub confidence: f64,
    pub task: String,
}

impl PipelineGateway {
    pub fn new(manager_script_path: &str) -> Result<Self, String> {
        Python::with_gil(|py| {
            let code = std::fs::read_to_string(manager_script_path)
                .map_err(|e| format!("Failed to read manager script: {}", e))?;

            let module = PyModule::from_code(py, &code, "manager.py", "manager")
                .map_err(|e| format!("Failed to load manager module: {}", e))?;

            Ok(Self {
                manager_module: module.into(),
            })
        })
    }

    pub fn call_pipeline(
        &self,
        config: &ProcessingConfig,
        signals: &[Vec<f64>],
    ) -> Result<Option<PipelineOutput>, String> {
        Python::with_gil(|py| {
            let module = self.manager_module.as_ref(py);

            // Translate ProcessingConfig into the dict format manager.py expects
            let pipeline_dict = build_python_pipeline_dict(py, config)?;

            // Transpose signals from (4, n_samples) → (n_samples, 4) as manager.py expects
            let transposed = transpose_signals(signals);
            let np_array = PyArray2::from_vec2(py, &transposed)
                .map_err(|e| format!("Failed to create numpy array: {}", e))?;

            let result = module
                .call_method1("run_pipeline_sync", (pipeline_dict, np_array))
                .map_err(|e| format!("Python pipeline error: {}", e))?;

            let classifier_output = result
                .get_item("classifier_output")
                .map_err(|e| format!("Failed to get classifier_output: {}", e))?;

            if classifier_output.is_none() {
                return Ok(None);
            }

            let overall_label: String = classifier_output
                .get_item("overall_label")
                .map_err(|e| format!("Missing overall_label: {}", e))?
                .extract()
                .map_err(|e| format!("Failed to extract overall_label: {}", e))?;

            let confidence: f64 = classifier_output
                .get_item("confidence")
                .map_err(|e| format!("Missing confidence: {}", e))?
                .extract()
                .map_err(|e| format!("Failed to extract confidence: {}", e))?;

            let task: String = classifier_output
                .get_item("task")
                .map_err(|e| format!("Missing task: {}", e))?
                .extract()
                .map_err(|e| format!("Failed to extract task: {}", e))?;

            Ok(Some(PipelineOutput {
                overall_label,
                confidence,
                task,
            }))
        })
    }
}

// Translates ProcessingConfig into the dict format manager.py expects.
// The field names differ between Rust and Python:
//   Rust ProcessingConfig.sfreq   → Python config "src_fs"
//   Rust ProcessingConfig.h_freq  → Python config "Filter"
//   Rust ProcessingConfig.l_freq  → Python config "low_cut_hz"
//   Rust ProcessingConfig.use_iir → Python config "method" ("IIR" or "FIR")
fn build_python_pipeline_dict<'py>(
    py: Python<'py>,
    config: &ProcessingConfig,
) -> Result<&'py PyDict, String> {
    let nodes_list = PyList::empty(py);

    if config.apply_bandpass {
        let bandpass_config = PyDict::new(py);
        bandpass_config
            .set_item("method", if config.use_iir { "IIR" } else { "FIR" })
            .map_err(|e| format!("Failed to set method: {}", e))?;
        bandpass_config
            .set_item("Filter", config.h_freq.unwrap_or(50.0))
            .map_err(|e| format!("Failed to set Filter: {}", e))?;
        bandpass_config
            .set_item("low_cut_hz", config.l_freq.unwrap_or(1.0))
            .map_err(|e| format!("Failed to set low_cut_hz: {}", e))?;
        bandpass_config
            .set_item("src_fs", config.sfreq)
            .map_err(|e| format!("Failed to set src_fs: {}", e))?;

        let node_dict = PyDict::new(py);
        node_dict
            .set_item("type", "bandpass filter")
            .map_err(|e| format!("Failed to set node type: {}", e))?;
        node_dict
            .set_item("config", bandpass_config)
            .map_err(|e| format!("Failed to set node config: {}", e))?;
        nodes_list
            .append(node_dict)
            .map_err(|e| format!("Failed to append bandpass node: {}", e))?;
    }

    let pipeline_dict = PyDict::new(py);
    pipeline_dict
        .set_item("nodes", nodes_list)
        .map_err(|e| format!("Failed to set nodes: {}", e))?;

    Ok(pipeline_dict)
}

// Transposes EEG signals from (n_channels, n_samples) to (n_samples, n_channels).
// Rust stores signals as Vec<Vec<f64>> shaped (4, n_samples) — channels first.
// manager.py expects (n_samples, 4) — samples first.
pub fn transpose_signals(signals: &[Vec<f64>]) -> Vec<Vec<f64>> {
    if signals.is_empty() || signals[0].is_empty() {
        return Vec::new();
    }
    let n_channels = signals.len();
    let n_samples = signals[0].len();
    let mut transposed = vec![vec![0.0_f64; n_channels]; n_samples];
    for (ch, channel) in signals.iter().enumerate() {
        for (s, &val) in channel.iter().enumerate() {
            transposed[s][ch] = val;
        }
    }
    transposed
}

#[cfg(test)]
mod tests {
    use super::transpose_signals;

    #[test]
    fn test_transpose_four_channels() {
        // 4 channels, 2 samples: [[1,2],[3,4],[5,6],[7,8]]
        // expected (n_samples, 4): [[1,3,5,7],[2,4,6,8]]
        let signals = vec![
            vec![1.0_f64, 2.0],
            vec![3.0_f64, 4.0],
            vec![5.0_f64, 6.0],
            vec![7.0_f64, 8.0],
        ];
        let result = transpose_signals(&signals);
        assert_eq!(result.len(), 2);
        assert_eq!(result[0], vec![1.0, 3.0, 5.0, 7.0]);
        assert_eq!(result[1], vec![2.0, 4.0, 6.0, 8.0]);
    }

    #[test]
    fn test_transpose_empty() {
        let result = transpose_signals(&[]);
        assert!(result.is_empty());
    }
}
