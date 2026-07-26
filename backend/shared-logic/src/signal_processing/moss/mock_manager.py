def run_pipeline_sync(pipeline, data):
    return {
        "processed_eeg": None,
        "classifier_output": {
            "status": "ok",
            "task": "focus",
            "overall_label": "focused",
            "confidence": 0.85,
            "segments": [{"label": "focused", "confidence": 0.85}],
            "class_probabilities": {"focused": 0.85, "unfocused": 0.15},
            "n_segments": 1,
        },
    }
