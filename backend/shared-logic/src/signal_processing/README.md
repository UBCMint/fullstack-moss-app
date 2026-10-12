# Rust–Python signal processing

The live path is `lsl.rs` → `PipelineGateway` → Python
`run_pipeline_sync(pipeline, data)`. Python runs inside the Rust process via
PyO3, not through a subprocess or HTTP service. The receiver initializes the
gateway inside `tokio::task::spawn_blocking` and reuses its module for batches.

## Selecting a manager

`receive_eeg_with_config` reads `PIPELINE_MANAGER_SCRIPT` when the receiver
starts. If unset, it uses
`/app/shared-logic/src/signal_processing/moss/mock_manager.py`; the websocket
Dockerfile also sets this value. For local development, set it to an absolute
path in your checkout (see the root README). It is a filesystem path, not a
Python module name. `PipelineGateway::new` reads the file and executes its source
with `PyModule::from_code(..., "manager.py", "manager")`.

- `mock_manager.py` ignores both arguments and always returns task `focus`,
  label `focused`, confidence `0.85`, one segment, probabilities
  `{focused: 0.85, unfocused: 0.15}`, and `processed_eeg: None`. It has no model
  imports; the Rust bridge still needs Python and NumPy. This is plumbing data,
  not inference or evidence of successful filtering.
- `manager.py` validates and executes nodes sequentially: quality check,
  bandpass/resampling/segmentation, and optionally ML. Its synchronous entry
  point uses `asyncio.run`; the async wrappers offload blocking work with
  `asyncio.to_thread`. It caches the encoder but loads the classifier per ML call.

**Current integration limit:** the Rust dictionary builder emits only optional
quality-check and bandpass nodes, in that order. It never emits an `ml` node or
forwards a frontend ML model selection. Switching scripts alone does not enable
live classification. A successfully loaded real manager therefore returns no ML
result for the graph currently built by Rust.

## Bridge input and output

Rust accepts channel-major `&[Vec<f64>]` and transposes it to a NumPy float64
array of shape `(n_samples, 4)`. Supply four equally sized channels in order
`TP9, AF7, AF8, TP10`; the transpose helper does not validate this contract.

The first argument is a Python dictionary, not a JSON string. With both optional
steps enabled it has this shape (values shown are illustrative):

```python
{
    "nodes": [
        {"type": "signal quality check", "config": {"sfreq": 256.0}},
        {"type": "bandpass filter", "config": {
            "method": "FIR",       # "IIR" when use_iir is true
            "Filter": 50.0,        # h_freq, defaults to 50 Hz
            "low_cut_hz": 1.0,     # l_freq, defaults to 1 Hz
            "src_fs": 256.0,       # ProcessingConfig.sfreq
        }},
    ]
}
```

Disabled steps are omitted, so `{"nodes": []}` is valid. A Python caller can
append `{"type": "ml", "config": {"task": "focus"}}` **after bandpass**.
The real ML wrapper requires a nonempty list of preprocessed arrays, not raw
samples. Tasks are `activity`, `focus`, `emotion`, and `stress`; `model` can also
name a task. An unmapped model name falls back to `activity`, while an explicit
unknown task raises an error. Bandpass also accepts `bandpass_filter`/`bandpass`.

The real manager returns:

```python
{
    "processed_eeg": raw_array_or_segment_list,
    "classifier_output": None,  # or a quality-only dict, or the ML dict below
}
```

- With no nodes, `processed_eeg` is the input array. After bandpass it is a list
  of `(4, 800)` arrays at 200 Hz. Bandpass requires at least four seconds of data
  because it also resamples and segments.
- Quality check leaves samples available to later nodes and sets
  `classifier_output` to `{"quality_report": {channel: status_string, ...}}`.
  A later ML node replaces this report. Use quality check before segmentation;
  the current list-concatenation handling does not support multiple segments
  correctly.
- After ML, `classifier_output` has this shape:

```python
{
    "status": "ok",
    "task": "focus",
    "overall_label": "<winning class name>",
    "confidence": 0.75,
    "segments": [{"label": "<class name>", "confidence": 0.9}, ...],
    "class_probabilities": {"<class name>": 0.6, ...},
    "n_segments": 4,
}
```

Overall confidence is the fraction of segments voting for the winning label;
segment confidence is its maximum class probability. Class probabilities are
means across segments, ordered highest first; scores are rounded to four places.

Rust extracts only `overall_label: String`, `confidence: f64`, and `task: String`
into `PipelineOutput`, attached as `EEGDataPacket.ml_result`. It ignores
`processed_eeg`, quality reports, and detailed probabilities; outgoing packet
signals remain the original samples. A null/non-dict classifier output or a
missing required field yields `Ok(None)`. A missing outer `classifier_output`,
Python exception, or failed type extraction yields an error. `lsl.rs` logs
per-batch errors and sets `ml_result` to `None`; failure to load the manager ends
that receiver before stream setup.

## Real-manager prerequisites and current path limitations

The shared dependency list is `backend/api-server/python/requirements.txt`.
Real inference also needs the task `.pkl` files in `moss/moss_models/` and an
externally supplied NeuroLM-B checkpoint. No checkpoint is tracked here.

The existing code has path differences that must be resolved before treating
real-manager startup as supported:

- `manager.py` expects `moss/checkpoints/NeuroLM-B.pt`; `coordinator.py` and the
  encoder default expect `moss/checkpoints/checkpoints/NeuroLM-B.pt`.
- The gateway supplies the synthetic filename `manager.py` to PyO3, so the
  manager's `__file__`-relative directories resolve from the process working
  directory, not necessarily the selected script's directory.
- `manager.py` imports `signalProcessing` before adding local import paths.
  Its directory (`signal_processing/`) and `moss/` must be importable, for
  example through `PYTHONPATH`. Providing import paths alone does not correct
  the checkpoint/model directories derived from that synthetic filename.

For standalone CSV inference, run `coordinator.py` directly as described in
[moss/README.txt](moss/README.txt). Do not interpret the default mock result as a
successful test of checkpoint loading or classifier compatibility.

## MOSS modules and outputs

| Module | Responsibility and output |
| --- | --- |
| `coordinator.py` | Standalone orchestration: `predict(csv_path, task)` and `predict_from_array(raw, src_fs, task)` run preprocessing → encoding → classification. Returns a result dict with the ML fields above plus `duration_s`, `src_sample_rate_hz`, and segment `start_s`/`end_s`. It is not called by either Rust wrapper today. The CLI prints a JSON result; caught prediction errors produce `{status: "error", error, trace}`. Encoder logging can also appear on stdout, so stdout is not guaranteed to be JSON only. |
| `classifier.py` | StandardScaler + scikit-learn MLP, training and pickle persistence. `predict((N, 768))` returns `(N label strings, (N, n_classes) probabilities)`. `predict_majority` returns `(winning label, vote fraction, (n_classes,) mean probabilities)`. `activity` maps to `muse2_classifier.pkl`; other tasks map to `<task>_classifier.pkl`. Labels come from the saved bundle. |
| `encoder.py` | Loads frozen NeuroLM-B; converts each `(4, 800)` window to 16 patches of 200 samples, pads to 276 tokens, pools valid tokenizer outputs, and projects to 768 dimensions. `encode_segment` returns `(768,)`; `encode` returns `(N, 768)` for nonempty input. |
| `preprocessing.py` | CSV loading or raw-array validation → 200 Hz resampling → segmentation. `preprocess(path)` returns `(segments, src_fs, duration_seconds)`; `from_array(raw, src_fs)` returns `(segments, duration_seconds)`. Rejects recordings shorter than four seconds. The `channel_order` argument is currently unused: callers must reorder channels themselves. No bandpass is applied here; that is a manager node. |
| `segmenter.py` | Splits `(samples, 4)` data into channel-first `(4, 800)` arrays with 400-sample steps (4-second windows, 2-second overlap at 200 Hz). Drops incomplete tails. `segment_with_timestamps` returns dictionaries containing `segment`, `start_s`, `end_s`, `index`; `get_n_segments` returns a count. |
| `loader.py` | Reads Mind Monitor (`RAW_*`), MuseLSL (`TP9`, etc.), or direct (`channel1`–`channel4`) CSV columns, drops missing EEG rows, and estimates sample rate (fallback 256 Hz). Returns `((samples, 4) float32 array, src_fs)`. |
| `resampler.py` | SciPy Fourier resampling per channel to 200 Hz. Returns `(int(samples * target_fs / src_fs), 4)` float32 data, or the input unchanged if rates match. `resample_channel` is the 1D equivalent. |

`model/` contains the NeuroLM/GPT/tokenizer/quantizer definitions, not a separate
service. `moss_models/` holds classifier bundles and embedding/results artifacts.
`muse2_predict.py` is an older standalone prediction CLI used by `predict.bat`;
its `NEUROLM_DIR` is hardcoded to `C:\Users\kiara\NeuroLM` and must be adjusted.
`setup.bat` creates a Python 3.11 Conda environment. `testing.py` contains manual
async manager exercises; CI does not execute these.

## Other Python entry points

`signal_processor.rs` is the older direct PyO3 wrapper around the
`signalProcessing` class in `signalProcessing.py`. It accepts channel-first
arrays, calls FIR/IIR bandpass (default 1–50 Hz) or downsampling, and converts the
returned float64 2D array back to `Vec<Vec<f64>>`. It does not call the coordinator.
The active LSL path uses `PipelineGateway` instead; `SIGNAL_PROCESSING_SCRIPT`
remains in the Dockerfile but its lookup in `lsl.rs` is commented out.

`backend/api-server/python/Eyeblink/` is a separate legacy blink-analysis/demo
package (filtering, trough/stable-point detection, timestamps, correlation and
accuracy utilities). The API's `/run-python-script` endpoint executes its
`test.py` and then `scripts/hello.py`, returning `{"python_output": string}` or
HTTP 500. It is not the MOSS inference API. Current obstacles include the
handler's `EyeBlink` spelling versus the checked-in `Eyeblink` directory,
external EEG datasets and plotting in `test.py`, and the API runtime image not
copying those Python sources/scripts. Installing requirements alone does not
make this demo endpoint operational.
