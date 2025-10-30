use log::info;
use pyo3::prelude::*;
use pyo3::types::PyModule;
use numpy::PyArray2;

pub struct SignalProcessor {
    processing_module: Py<PyModule>,
}

impl SignalProcessor {
    pub fn new(python_script_path: &str) -> Result<Self, String> {
        Python::with_gil(|py| {
            // Load your signal processing module
            let code = std::fs::read_to_string(python_script_path)
                .map_err(|e| format!("Failed to read Python script: {}", e))?;
            
            let module = PyModule::from_code(
                py, 
                &code,
                "signal_processing.py",
                "signal_processing"
            ).map_err(|e| format!("Failed to load Python module: {}", e))?;
            
            Ok(Self {
                processing_module: module.into(),
            })
        })
    }

    /// Apply FIR bandpass filter to the signal data
    pub fn apply_fir_bandpass(
        &self,
        data: &[Vec<f64>],  
        sfreq: f32,
        l_freq: Option<f32>,
        h_freq: Option<f32>,
    ) -> Result<Vec<Vec<f64>>, String> {  
        info!("In the Fir bandpass");
        
        Python::with_gil(|py| {
            let module = self.processing_module.as_ref(py);
            
            // Get the class
            let processor_class = module
                .getattr("signalProcessing")
                .map_err(|e| format!("Failed to get signalProcessing class: {}", e))?;

            // Convert Rust data to numpy array 
            let np_data = self.vec_to_numpy(py, data)?;
            
            // Call the static method directly on the class
            let kwargs = pyo3::types::PyDict::new(py);
            kwargs.set_item("data", np_data)
                .map_err(|e| format!("Failed to set data: {}", e))?;
            kwargs.set_item("sfreq", sfreq)
                .map_err(|e| format!("Failed to set sfreq: {}", e))?;
            kwargs.set_item("l_freq", l_freq.unwrap_or(1.0))
                .map_err(|e| format!("Failed to set l_freq: {}", e))?;
            kwargs.set_item("h_freq", h_freq.unwrap_or(50.0))
                .map_err(|e| format!("Failed to set h_freq: {}", e))?;

            let result = processor_class
                .call_method("fir_bandpass_filter", (), Some(kwargs))
                .map_err(|e| format!("Python processing error: {}", e))?;

            // Convert result back to Rust
            self.numpy_to_vec(py, result)
        })
    }

    /// Apply IIR bandpass filter
    pub fn apply_iir_bandpass(
        &self,
        data: &[Vec<f64>], 
        sfreq: f32,
        l_freq: Option<f32>,
        h_freq: Option<f32>,
    ) -> Result<Vec<Vec<f64>>, String> {  
        Python::with_gil(|py| {
            let module = self.processing_module.as_ref(py);
            
            // Get the class (not an instance)
            let processor_class = module.getattr("signalProcessing")
                .map_err(|e| format!("Failed to get signalProcessing class: {}", e))?;
                
            let np_data = self.vec_to_numpy(py, data)?;
            
            let kwargs = pyo3::types::PyDict::new(py);
            kwargs.set_item("data", np_data)
                .map_err(|e| format!("Failed to set data: {}", e))?;
            kwargs.set_item("sfreq", sfreq)
                .map_err(|e| format!("Failed to set sfreq: {}", e))?;
            kwargs.set_item("l_freq", l_freq.unwrap_or(1.0))
                .map_err(|e| format!("Failed to set l_freq: {}", e))?;
            kwargs.set_item("h_freq", h_freq.unwrap_or(50.0))
                .map_err(|e| format!("Failed to set h_freq: {}", e))?;

            let result = processor_class.call_method("iir_bandpass_filter", (), Some(kwargs))
                .map_err(|e| format!("Python processing error: {}", e))?;
            self.numpy_to_vec(py, result)
        })
    }

    /// Downsample the signal
    pub fn downsample(&self, data: &[Vec<f64>], factor: u32) -> Result<Vec<Vec<f64>>, String> {
        Python::with_gil(|py| {
            let module = self.processing_module.as_ref(py);
            
            // Get the class (not an instance)
            let processor_class = module.getattr("signalProcessing")
                .map_err(|e| format!("Failed to get signalProcessing class: {}", e))?;
                
            let np_data = self.vec_to_numpy(py, data)?;
            
            let result = processor_class.call_method1("downsample", (np_data, factor))
                .map_err(|e| format!("Python processing error: {}", e))?;
            self.numpy_to_vec(py, result)
        })
    }

    // Helper: Convert Vec<Vec<f64>> to numpy array 
    fn vec_to_numpy<'py>(
        &self,
        py: Python<'py>,
        data: &[Vec<f64>],  
    ) -> Result<&'py PyArray2<f64>, String> {
        if data.is_empty() {
            return Err("Empty data".to_string());
        }
        
        let n_channels = data.len();
        let n_samples = data[0].len();
        
        // // Validate all channels have same length
        // for (i, ch) in data.iter().enumerate() {
        //     if ch.len() != n_samples {
        //         return Err(format!("Channel {} has {} samples, expected {}", i, ch.len(), n_samples));
        //     }
        // }
        
        // Create numpy array directly
        let array = PyArray2::from_vec2(py, data)
            .map_err(|e| format!("Failed to create numpy array: {}", e))?;
        
        Ok(array)
    }

    // Helper: Convert numpy array back to Vec<Vec<f64>> 
    fn numpy_to_vec(&self, py: Python, result: &PyAny) -> Result<Vec<Vec<f64>>, String> {
        let array: &PyArray2<f64> = result
            .extract()
            .map_err(|e| format!("Failed to extract numpy array: {}", e))?;
        
        // Get shape
        let shape = array.shape();
        let n_channels = shape[0];
        let n_samples = shape[1];
        
        // Get readonly view of the data
        let data = array.readonly();
        let slice = data.as_slice()
            .map_err(|e| format!("Failed to get array slice: {}", e))?;
        
        // Reshape back to Vec<Vec<f64>> 
        let mut result = Vec::with_capacity(n_channels);
        for ch in 0..n_channels {
            let start = ch * n_samples;
            let end = start + n_samples;
            result.push(slice[start..end].to_vec());
        }
        
        Ok(result)
    }
}