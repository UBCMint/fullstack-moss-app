use numpy::PyArray2;
use pyo3::prelude::*;
use pyo3::types::{PyDict, PyList, PyModule};
use serde::{Deserialize, Serialize};

use crate::channels::ChannelLayout;
use crate::lsl::ProcessingConfig;

/// Env var holding the comma-separated, 0-based EEG channel indices fed to the ML models,
/// e.g. `ML_EEG_CHANNELS=0,1,2,3`.
pub const ML_EEG_CHANNELS_ENV: &str = "ML_EEG_CHANNELS";

/// Channels the current Python models were trained on (4-channel Muse: TP9, AF7, AF8, TP10).
/// Change this (and [`DEFAULT_ML_EEG_CHANNELS`]) when the 8-channel models land.
pub const MODEL_CHANNEL_COUNT: usize = 4;

/// Default EEG subset passed to the models: the first [`MODEL_CHANNEL_COUNT`] EEG channels.
pub const DEFAULT_ML_EEG_CHANNELS: [usize; MODEL_CHANNEL_COUNT] = [0, 1, 2, 3];

/// The EEG channels (indices into `EEGDataPacket::eeg`) that are passed to the models, in
/// the order the models expect them. Always exactly [`MODEL_CHANNEL_COUNT`] distinct indices
/// that exist in the session's [`ChannelLayout`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MlChannelSelection(Vec<usize>);

impl MlChannelSelection {
    pub fn new(indices: Vec<usize>, layout: &ChannelLayout) -> Result<Self, String> {
        if indices.len() != MODEL_CHANNEL_COUNT {
            return Err(format!(
                "the ML models take exactly {} EEG channels, got {:?}",
                MODEL_CHANNEL_COUNT, indices
            ));
        }
        if let Some(&bad) = indices.iter().find(|&&i| i >= layout.eeg()) {
            return Err(format!(
                "EEG channel index {} is out of range: the layout has {} EEG channels",
                bad,
                layout.eeg()
            ));
        }
        let mut sorted = indices.clone();
        sorted.sort_unstable();
        sorted.dedup();
        if sorted.len() != indices.len() {
            return Err(format!("duplicate EEG channel in {:?}", indices));
        }
        Ok(Self(indices))
    }

    /// Reads `ML_EEG_CHANNELS`, using [`DEFAULT_ML_EEG_CHANNELS`] when it is unset.
    pub fn from_env(layout: &ChannelLayout) -> Result<Self, String> {
        Self::from_lookup(layout, |key| std::env::var(key).ok())
    }

    /// Like [`from_env`](Self::from_env), with an injectable lookup (for tests).
    pub fn from_lookup(
        layout: &ChannelLayout,
        lookup: impl Fn(&str) -> Option<String>,
    ) -> Result<Self, String> {
        let indices = match lookup(ML_EEG_CHANNELS_ENV) {
            None => DEFAULT_ML_EEG_CHANNELS.to_vec(),
            Some(value) => value
                .split(',')
                .map(|part| part.trim().parse::<usize>())
                .collect::<Result<Vec<_>, _>>()
                .map_err(|_| {
                    format!(
                        "{}={:?} is not a comma-separated list of channel indices",
                        ML_EEG_CHANNELS_ENV, value
                    )
                })?,
        };
        Self::new(indices, layout)
    }

    pub fn indices(&self) -> &[usize] {
        &self.0
    }

    /// Borrows the selected channels out of `eeg`, in selection order.
    pub fn select<'a>(&self, eeg: &'a [Vec<f64>]) -> Result<Vec<&'a [f64]>, String> {
        self.0
            .iter()
            .map(|&i| {
                eeg.get(i).map(Vec::as_slice).ok_or_else(|| {
                    format!(
                        "EEG channel {} requested but the packet has {}",
                        i,
                        eeg.len()
                    )
                })
            })
            .collect()
    }
}

pub struct PipelineGateway {
    manager_module: Py<PyModule>,
    ml_channels: MlChannelSelection,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PipelineOutput {
    pub overall_label: String,
    pub confidence: f64,
    pub task: String,
}

impl PipelineGateway {
    pub fn new(manager_script_path: &str, ml_channels: MlChannelSelection) -> Result<Self, String> {
        Python::with_gil(|py| {
            let code = std::fs::read_to_string(manager_script_path)
                .map_err(|e| format!("Failed to read manager script: {}", e))?;

            let module = PyModule::from_code(py, &code, "manager.py", "manager")
                .map_err(|e| format!("Failed to load manager module: {}", e))?;

            Ok(Self {
                manager_module: module.into(),
                ml_channels,
            })
        })
    }

    /// Runs the Python pipeline on one window. `eeg` is every EEG channel of the packet; only
    /// the [`MlChannelSelection`] subset is passed to Python.
    pub fn call_pipeline(
        &self,
        config: &ProcessingConfig,
        eeg: &[Vec<f64>],
    ) -> Result<Option<PipelineOutput>, String> {
        let model_input = self.ml_channels.select(eeg)?;
        Python::with_gil(|py| {
            let module = self.manager_module.as_ref(py);

            // Translate ProcessingConfig into the dict format manager.py expects
            let pipeline_dict = build_python_pipeline_dict(py, config)?;

            // Transpose from (MODEL_CHANNEL_COUNT, n_samples) to (n_samples, MODEL_CHANNEL_COUNT)
            // as manager.py expects
            let transposed = transpose_signals(&model_input);
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

// Translates ProcessingConfig into the dict format manager.py expects.
fn build_python_pipeline_dict<'py>(
    py: Python<'py>,
    config: &ProcessingConfig,
) -> Result<&'py PyDict, String> {
    let nodes_list = PyList::empty(py);

    // Configurable Quality Check Node
    if config.apply_quality_check {
        let quality_config = PyDict::new(py);
        quality_config
            .set_item("sfreq", config.sfreq)
            .map_err(|e| format!("Failed to set sfreq: {}", e))?;

        let node_dict = PyDict::new(py);
        node_dict
            .set_item("type", "signal quality check")
            .map_err(|e| format!("Failed to set node type: {}", e))?;
        node_dict
            .set_item("config", quality_config)
            .map_err(|e| format!("Failed to set node config: {}", e))?;

        nodes_list
            .append(node_dict)
            .map_err(|e| format!("Failed to append quality check node: {}", e))?;
    }

    // Bandpass filter configuration
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
pub fn transpose_signals<S: AsRef<[f64]>>(signals: &[S]) -> Vec<Vec<f64>> {
    let Some(first) = signals.first() else {
        return Vec::new();
    };
    let n_channels = signals.len();
    let n_samples = first.as_ref().len();
    let mut transposed = vec![vec![0.0_f64; n_channels]; n_samples];
    for (ch, channel) in signals.iter().enumerate() {
        for (s, &val) in channel.as_ref().iter().enumerate() {
            transposed[s][ch] = val;
        }
    }
    transposed
}

#[cfg(test)]
mod tests {
    use super::*;

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
        let result = transpose_signals::<Vec<f64>>(&[]);
        assert!(result.is_empty());
    }

    #[test]
    fn test_transpose_borrowed_subset() {
        let a = [1.0_f64, 2.0];
        let b = [3.0_f64, 4.0];
        let result = transpose_signals(&[&a[..], &b[..]]);
        assert_eq!(result, vec![vec![1.0, 3.0], vec![2.0, 4.0]]);
    }

    fn eeg_8ch() -> Vec<Vec<f64>> {
        (0..8).map(|c| vec![c as f64; 3]).collect()
    }

    #[test]
    fn ml_selection_defaults_to_first_four_eeg_channels() {
        let selection =
            MlChannelSelection::from_lookup(&ChannelLayout::default(), |_| None).unwrap();
        assert_eq!(selection.indices(), &DEFAULT_ML_EEG_CHANNELS);
        let eeg = eeg_8ch();
        let picked = selection.select(&eeg).unwrap();
        assert_eq!(picked.len(), MODEL_CHANNEL_COUNT);
        assert_eq!(picked[3], &[3.0, 3.0, 3.0][..]);
    }

    #[test]
    fn ml_selection_reads_env_override_in_order() {
        let selection = MlChannelSelection::from_lookup(&ChannelLayout::default(), |_| {
            Some("7, 2,5,0".to_string())
        })
        .unwrap();
        let eeg = eeg_8ch();
        let first_values: Vec<f64> = selection
            .select(&eeg)
            .unwrap()
            .iter()
            .map(|ch| ch[0])
            .collect();
        assert_eq!(first_values, vec![7.0, 2.0, 5.0, 0.0]);
    }

    #[test]
    fn ml_selection_rejects_bad_indices() {
        let layout = ChannelLayout::default();
        // wrong count
        assert!(MlChannelSelection::new(vec![0, 1, 2], &layout).is_err());
        // out of range for 8 EEG channels
        assert!(MlChannelSelection::new(vec![0, 1, 2, 8], &layout).is_err());
        // duplicate
        assert!(MlChannelSelection::new(vec![0, 1, 1, 2], &layout).is_err());
        // a 2-EEG-channel device can't feed a 4-channel model
        let small = ChannelLayout::new(2, 4).unwrap();
        assert!(MlChannelSelection::from_lookup(&small, |_| None).is_err());
        // unparsable env value
        assert!(MlChannelSelection::from_lookup(&layout, |_| Some("a,b".into())).is_err());
    }
}
