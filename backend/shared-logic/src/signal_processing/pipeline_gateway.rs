use numpy::PyArray2;
use pyo3::prelude::*;
use pyo3::types::{PyDict, PyList, PyModule};
use serde::{Deserialize, Serialize};

use crate::pipeline::MlTap;

pub struct PipelineGateway {
    manager_module: Py<PyModule>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PipelineOutput {
    pub overall_label: String,
    pub confidence: f64,
    pub task: String,
}

// The model's preprocessing in manager.py uses the closest filter before the ML node, or the
// defaults (quality check on, 1-50 Hz FIR) if there isn't one.
#[derive(Debug, Clone, PartialEq)]
pub struct MlRequest {
    pub task: String,
    pub sfreq: f64,
    pub quality_check: bool,
    pub use_iir: bool,
    pub l_freq: f64,
    pub h_freq: f64,
}

impl MlRequest {
    pub fn new(tap: &MlTap, sfreq: f64) -> Self {
        let filter = tap.upstream_filter.as_ref().filter(|f| f.apply_bandpass);
        let l_freq = filter.and_then(|f| f.l_freq).map_or(1.0, f64::from);
        let h_freq = filter.and_then(|f| f.h_freq).map_or(50.0, f64::from);
        Self {
            task: tap.config.model.trim().to_lowercase(),
            sfreq,
            quality_check: tap
                .upstream_filter
                .as_ref()
                .is_none_or(|f| f.apply_quality_check),
            use_iir: filter.is_some_and(|f| f.use_iir),
            l_freq,
            // manager.py rejects cutoffs at or above nyquist (possible after a resample node)
            h_freq: h_freq.min(0.45 * sfreq),
        }
    }
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
        request: &MlRequest,
        signals: &[Vec<f64>],
    ) -> Result<Option<PipelineOutput>, String> {
        Python::with_gil(|py| {
            let module = self.manager_module.as_ref(py);

            // Translate the request into the dict format manager.py expects
            let pipeline_dict = build_python_pipeline_dict(py, request)?;

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

            // Downcast classifier_output to PyDict safely
            let classifier_dict = match classifier_output.downcast::<PyDict>() {
                Ok(dict) => dict,
                Err(_) => return Ok(None),
            };

            // Safely check if overall_label exists (ML ran). If not, return Ok(None) cleanly
            let overall_label_item = match classifier_dict.get_item("overall_label") {
                Some(item) => item,
                None => return Ok(None),
            };

            let overall_label: String = overall_label_item
                .extract()
                .map_err(|e| format!("Failed to extract overall_label: {}", e))?;
            let confidence_item = match classifier_dict.get_item("confidence") {
                Some(item) => item,
                None => return Ok(None),
            };

            let task_item = match classifier_dict.get_item("task") {
                Some(item) => item,
                None => return Ok(None),
            };

            let confidence: f64 = confidence_item
                .extract()
                .map_err(|e| format!("Failed to extract confidence: {}", e))?;

            let task: String = task_item
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

// Translates an MlRequest into the dict format manager.py expects:
// [signal quality check] -> bandpass filter (also resamples to 200 Hz and segments) -> ml.
fn build_python_pipeline_dict<'py>(
    py: Python<'py>,
    request: &MlRequest,
) -> Result<&'py PyDict, String> {
    fn node<'py>(
        py: Python<'py>,
        node_type: &str,
        config: &[(&str, PyObject)],
    ) -> Result<&'py PyDict, String> {
        let config_dict = PyDict::new(py);
        for (key, value) in config {
            config_dict
                .set_item(*key, value)
                .map_err(|e| format!("Failed to set {}: {}", key, e))?;
        }
        let node_dict = PyDict::new(py);
        node_dict
            .set_item("type", node_type)
            .map_err(|e| format!("Failed to set node type: {}", e))?;
        node_dict
            .set_item("config", config_dict)
            .map_err(|e| format!("Failed to set node config: {}", e))?;
        Ok(node_dict)
    }

    let nodes_list = PyList::empty(py);
    let push = |n: &PyDict| {
        nodes_list
            .append(n)
            .map_err(|e| format!("Failed to append node: {}", e))
    };

    if request.quality_check {
        push(node(
            py,
            "signal quality check",
            &[("sfreq", request.sfreq.into_py(py))],
        )?)?;
    }
    push(node(
        py,
        "bandpass filter",
        &[
            (
                "method",
                if request.use_iir { "IIR" } else { "FIR" }.into_py(py),
            ),
            ("Filter", request.h_freq.into_py(py)),
            ("low_cut_hz", request.l_freq.into_py(py)),
            ("src_fs", request.sfreq.into_py(py)),
        ],
    )?)?;
    push(node(
        py,
        "ml",
        &[("task", request.task.as_str().into_py(py))],
    )?)?;

    let pipeline_dict = PyDict::new(py);
    pipeline_dict
        .set_item("nodes", nodes_list)
        .map_err(|e| format!("Failed to set nodes: {}", e))?;

    Ok(pipeline_dict)
}

// Transposes EEG signals from (n_channels, n_samples) to (n_samples, n_channels).
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
    use super::{transpose_signals, MlRequest};
    use crate::pipeline::{MLConfig, MlTap, PreprocessingConfig};

    fn tap(upstream_filter: Option<PreprocessingConfig>) -> MlTap {
        MlTap {
            node_id: "ml".into(),
            config: MLConfig {
                model: "Stress".into(),
            },
            after_stage: 1,
            upstream_filter,
        }
    }

    #[test]
    fn ml_request_uses_model_as_task_and_upstream_filter() {
        let r = MlRequest::new(
            &tap(Some(PreprocessingConfig {
                apply_quality_check: false,
                use_iir: true,
                l_freq: Some(4.0),
                h_freq: Some(30.0),
                ..Default::default()
            })),
            256.0,
        );
        assert_eq!(r.task, "stress");
        assert!(!r.quality_check);
        assert!(r.use_iir);
        assert_eq!((r.l_freq, r.h_freq), (4.0, 30.0));
    }

    #[test]
    fn ml_request_defaults_and_clamps_to_nyquist() {
        let r = MlRequest::new(&tap(None), 64.0);
        assert!(r.quality_check);
        assert!(!r.use_iir);
        assert_eq!(r.l_freq, 1.0);
        assert_eq!(r.h_freq, 0.45 * 64.0);
    }

    #[test]
    fn test_transpose_four_channels() {
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
