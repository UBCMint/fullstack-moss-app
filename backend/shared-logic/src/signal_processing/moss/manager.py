import os
import sys
import asyncio
import numpy as np

# manager runs a configurable pipeline using function pointers.
# each node type maps to one wrapper function with the same interface.

# set up local import paths so this file can run from other working directories
SCRIPT_DIRECTORY = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIRECTORY)
sys.path.insert(0, os.path.dirname(SCRIPT_DIRECTORY))

# import real entry points used by this pipeline manager
from preprocessing import from_array
from encoder import NeuroLMEncoder
from classifier import load_classifier, TASK_CLASSIFIER_MAP
from signalProcessing import signalProcessing

# shared constants for this manager
CHECKPOINT = os.path.join(SCRIPT_DIRECTORY, "checkpoints", "NeuroLM-B.pt")
MODELS_DIR = os.path.join(SCRIPT_DIRECTORY, "moss_models")
DEFAULT_SRC_FS = 256
DEFAULT_TASK = "activity"

# encoder is expensive to load, so we keep one and reuse it
_encoder = None



def get_encoder():
    global _encoder
    if _encoder is None:
        _encoder = NeuroLMEncoder(
            checkpoint_path=CHECKPOINT,
            neurolm_dir=os.path.dirname(SCRIPT_DIRECTORY),
        )
    return _encoder

def normalize_node_type(node_type):
    # support both "bandpass filter" and "bandpass_filter" config spellings
    normalized = node_type.strip().lower()
    if normalized in ("bandpass_filter", "bandpass"):
        return "bandpass filter"
    return normalized

def resolve_task(config):
    # task controls which classifier file to load (activity/focus/emotion/stress)
    task = config.get("task")
    model_name = config.get("model")

    # if config sends model as a task name, support that directly
    if task is None and isinstance(model_name, str) and model_name in TASK_CLASSIFIER_MAP:
        task = model_name

    # if model is present but not wired to a task yet, keep behavior explicit
    if task is None and isinstance(model_name, str) and model_name not in TASK_CLASSIFIER_MAP:
        print(
            f"ML model '{model_name}' is not mapped to a task yet; "
            f"defaulting to '{DEFAULT_TASK}'."
        )

    if task is None:
        task = DEFAULT_TASK

    if not isinstance(task, str):
        raise TypeError("ML config 'task' must be a string.")

    if task not in TASK_CLASSIFIER_MAP:
        supported_tasks = ", ".join(sorted(TASK_CLASSIFIER_MAP.keys()))
        raise ValueError(f"Unknown ML task '{task}'. Supported tasks: {supported_tasks}")

    return task


# wrapper functions for each processing step so we have a consistent interface/signature for our function map
async def bandpass_filter(data, config):
    print(f"Running bandpass filter with config: {config}")
    # this node expects raw eeg samples with muse channel order
    if not isinstance(data, np.ndarray):
        raise TypeError("Bandpass filter expects raw EEG data as a numpy array.")
    if data.ndim != 2 or data.shape[1] != 4:
        raise ValueError(f"Expected raw EEG shape (n_samples, 4), got {data.shape}.")

    # src_fs can come in multiple config keys while requirements are being finalized
    src_fs = config.get("src_fs", config.get("sample_rate_hz", DEFAULT_SRC_FS))
    if not isinstance(src_fs, (int, float)):
        raise TypeError("Bandpass config 'src_fs' must be a number.")
    if src_fs <= 0:
        raise ValueError("Bandpass config 'src_fs' must be greater than 0.")

    # method controls which existing bandpass entry point runs; Filter is treated as high cutoff (Hz)
    method = config.get("method", "FIR")
    filter_value = config.get("Filter", 50.0)
    low_cutoff = config.get("low_cut_hz", config.get("l_freq", 1.0))

    if not isinstance(method, str):
        raise TypeError("Bandpass config 'method' must be a string.")
    if not isinstance(filter_value, (int, float)):
        raise TypeError("Bandpass config 'Filter' must be numeric.")
    if not isinstance(low_cutoff, (int, float)):
        raise TypeError("Bandpass config 'low_cut_hz' must be numeric when provided.")

    high_cutoff = float(filter_value)
    low_cutoff = float(low_cutoff)
    nyquist = float(src_fs) / 2.0
    if low_cutoff <= 0:
        raise ValueError("Bandpass low cutoff must be greater than 0.")
    if high_cutoff <= low_cutoff:
        raise ValueError("Bandpass high cutoff must be greater than low cutoff.")
    if high_cutoff >= nyquist:
        raise ValueError(f"Bandpass high cutoff must be less than Nyquist ({nyquist:.2f} Hz).")

    # signalProcessing bandpass functions expect (n_channels, n_samples), so transpose first
    channels_first = np.asarray(data.T, dtype=np.float64)
    normalized_method = method.strip().upper()
    if normalized_method == "FIR":
        filtered_channels_first = await asyncio.to_thread(
            signalProcessing.fir_bandpass_filter,
            channels_first,
            float(src_fs),
            low_cutoff,
            high_cutoff,
        )
    elif normalized_method == "IIR":
        filtered_channels_first = await asyncio.to_thread(
            signalProcessing.iir_bandpass_filter,
            channels_first,
            float(src_fs),
            low_cutoff,
            high_cutoff,
        )
    else:
        raise ValueError("Bandpass config 'method' must be either 'FIR' or 'IIR'.")

    filtered_data = np.asarray(filtered_channels_first, dtype=np.float32).T

    # from_array() handles resampling + segmentation after configurable bandpass
    segments, _duration = await asyncio.to_thread(from_array, filtered_data, int(src_fs))
    return segments

async def run_ml(data, config):
    print(f"Running ML with config: {config}")
    # ml expects preprocessed segments from the previous node
    if not isinstance(data, list) or len(data) == 0:
        raise ValueError("ML node expects a non-empty list of preprocessed EEG segments.")
    if not all(isinstance(segment, np.ndarray) for segment in data):
        raise TypeError("ML node expects each segment to be a numpy array.")

    task = resolve_task(config)
    encoder = get_encoder()

    # all core ml steps here are blocking python calls, so run each in a thread
    embeddings = await asyncio.to_thread(encoder.encode, data)
    classifier = await asyncio.to_thread(load_classifier, task, MODELS_DIR)
    segment_labels, segment_probabilities = await asyncio.to_thread(classifier.predict, embeddings)
    overall_label, confidence, mean_probabilities = await asyncio.to_thread(
        classifier.predict_majority,
        embeddings,
    )

    # keep class probabilities sorted highest-first for easier downstream usage
    class_probabilities = {
        name: round(float(probability), 4)
        for name, probability in sorted(
            zip(classifier.label_names, mean_probabilities),
            key=lambda pair: -pair[1],
        )
    }

    # keep per-segment labels + confidence so frontend has both aggregate and per-window output
    segments = []
    for label, probabilities in zip(segment_labels, segment_probabilities):
        segments.append(
            {
                "label": label,
                "confidence": round(float(probabilities.max()), 4),
            }
        )

    return {
        "status": "ok",
        "task": task,
        "overall_label": overall_label,
        "confidence": round(float(confidence), 4),
        "segments": segments,
        "class_probabilities": class_probabilities,
        "n_segments": len(segment_labels),
    }


# function map must be defined after wrappers so function names already exist
FUNCTION_MAP = {
    "bandpass filter": bandpass_filter,
    "ml": run_ml,
}

# run our pipeline by iterating through each node and applying each mapped function in sequence
async def run_pipeline(pipeline, data):
    if not isinstance(pipeline, dict):
        raise TypeError("Pipeline must be a dictionary.")

    nodes = pipeline.get("nodes")
    if not isinstance(nodes, list):
        raise ValueError("Pipeline must include a 'nodes' list.")

    # keep both outputs so we can return preprocessed eeg + classifier output together
    processed_eeg = data
    classifier_output = None

    for index, node in enumerate(nodes):
        if not isinstance(node, dict):
            raise TypeError(f"Node at index {index} must be a dictionary.")
        if "type" not in node:
            raise ValueError(f"Node at index {index} is missing required key 'type'.")
        if not isinstance(node["type"], str):
            raise TypeError(f"Node type at index {index} must be a string.")

        node_type = normalize_node_type(node["type"])
        if node_type not in FUNCTION_MAP:
            supported_nodes = ", ".join(sorted(FUNCTION_MAP.keys()))
            raise ValueError(
                f"Unknown pipeline node type '{node['type']}'. Supported node types: {supported_nodes}"
            )

        config = node.get("config", {})
        if config is None:
            config = {}
        if not isinstance(config, dict):
            raise TypeError(f"Config for node '{node['type']}' must be a dictionary.")

        func = FUNCTION_MAP[node_type]
        try:
            result = await func(processed_eeg, config)
        except Exception as error:
            raise RuntimeError(f"Pipeline node '{node['type']}' failed: {error}") from error

        # preprocessing nodes update the eeg data passed to later nodes
        if node_type == "bandpass filter":
            processed_eeg = result
        # ml node stores classification output separately
        elif node_type == "ml":
            classifier_output = result

    return {
        "processed_eeg": processed_eeg,
        "classifier_output": classifier_output,
    }


if __name__ == "__main__":
    # quick async smoke test with generated data (preprocessing only)
    test_pipeline = {
        "nodes": [
            {"type": "bandpass filter", "config": {"method": "FIR", "Filter": 100}},
        ]
    }

    # synthetic eeg shaped like muse data: (n_samples, 4 channels)
    sample_eeg = np.random.randn(1200, 4).astype(np.float32)
    output = asyncio.run(run_pipeline(test_pipeline, sample_eeg))
    print(f"Pipeline output keys: {list(output.keys())}")
    print(f"Preprocessed segment count: {len(output['processed_eeg'])}")

