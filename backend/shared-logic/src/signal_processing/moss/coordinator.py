"""
MOSS - coordinator.py
=====================
Python coordinator layer — orchestrates preprocessing, encoding, and classification.

This is the main entry point for the Rust signal_processor.rs to call into.
It exposes a clean JSON interface so Rust can invoke it via subprocess or PyO3.

Usage (from command line / Rust subprocess):
    python coordinator.py predict --input recording.csv --task activity
    python coordinator.py predict --input recording.csv --task focus
    python coordinator.py predict --input recording.csv --task emotion

Output (JSON to stdout):
    {
        "task": "activity",
        "overall_label": "rest",
        "confidence": 0.83,
        "segments": [
            {"start_s": 0, "end_s": 4, "label": "rest", "confidence": 0.91},
            ...
        ],
        "class_probabilities": {"eat": 0.02, "game": 0.01, "read": 0.03, ...},
        "duration_s": 45.2,
        "n_segments": 21,
        "status": "ok"
    }

Architecture:
    Rust (signal_processor.rs)
        ↓ subprocess / PyO3
    coordinator.py          ← you are here
        ↓                       ↓                   ↓
    preprocessing.py    →   encoder.py    →   classifier.py
"""

import os
import sys
import json
import argparse
import traceback
import numpy as np

# Add parent dir to path so model/ is importable
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
sys.path.insert(0, os.path.dirname(__file__))

from preprocessing import preprocess
from encoder import NeuroLMEncoder
from classifier import load_classifier

# ── Paths ──────────────────────────────────────────────────────────────────────
SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
CHECKPOINT  = os.path.join(SCRIPT_DIR, 'checkpoints', 'checkpoints', 'NeuroLM-B.pt')
MODELS_DIR  = os.path.join(SCRIPT_DIR, 'moss_models')

# Singleton encoder — loaded once and reused across calls
_encoder: NeuroLMEncoder = None

def get_encoder() -> NeuroLMEncoder:
    """Lazy-load the NeuroLM encoder (expensive, so only once)."""
    global _encoder
    if _encoder is None:
        _encoder = NeuroLMEncoder(
            checkpoint_path=CHECKPOINT,
            neurolm_dir=os.path.dirname(SCRIPT_DIR)
        )
    return _encoder


def predict(input_path: str, task: str) -> dict:
    """
    Full prediction pipeline for one recording and one task.

    Args:
        input_path: path to Muse 2 CSV file
        task:       'activity', 'focus', 'emotion', or 'stress'

    Returns:
        result dict (see module docstring for schema)
    """
    # 1. Preprocess
    segments, src_fs, duration = preprocess(input_path)


def predict_from_array(raw: np.ndarray, src_fs: int, task: str) -> dict:
    """
    Full prediction pipeline from a raw numpy array.
    Use this for real-time streaming from the Muse 2 headset.

    Args:
        raw:    (n_samples, 4) float32 array [TP9, AF7, AF8, TP10]
        src_fs: sample rate of the incoming data (e.g. 256 for Muse 2)
        task:   'activity', 'focus', 'emotion', or 'stress'

    Returns:
        result dict (same schema as predict())

    Example:
        raw = np.array(lsl_samples, dtype=np.float32)  # from LSL stream
        result = predict_from_array(raw, src_fs=256, task='focus')
        print(result['overall_label'])   # e.g. 'concentrating'
    """
    from preprocessing import from_array

    # 1. Preprocess from array
    segments, duration = from_array(raw, src_fs)
    src_fs_out = src_fs

    # 2. Encode
    encoder    = get_encoder()
    embeddings = encoder.encode(segments)   # (N, 768)

    # 3. Classify
    clf = load_classifier(task, models_dir=MODELS_DIR)
    seg_labels, seg_probas = clf.predict(embeddings)
    overall_label, confidence, mean_proba = clf.predict_majority(embeddings)

    # 4. Build output
    step_s = 2.0   # 50% overlap → 2s step
    win_s  = 4.0

    segment_results = []
    for i, (label, proba) in enumerate(zip(seg_labels, seg_probas)):
        segment_results.append({
            'start_s':   round(i * step_s, 1),
            'end_s':     round(i * step_s + win_s, 1),
            'label':     label,
            'confidence': round(float(proba.max()), 4),
        })

    class_probabilities = {
        name: round(float(p), 4)
        for name, p in sorted(
            zip(clf.label_names, mean_proba),
            key=lambda x: -x[1]
        )
    }

    return {
        'status':              'ok',
        'task':                task,
        'overall_label':       overall_label,
        'confidence':          round(confidence, 4),
        'segments':            segment_results,
        'class_probabilities': class_probabilities,
        'duration_s':          round(duration, 2),
        'n_segments':          len(segments),
        'src_sample_rate_hz':  src_fs,
    }


def main():
    parser = argparse.ArgumentParser(
        description='MOSS coordinator — EEG mental state prediction'
    )
    subparsers = parser.add_subparsers(dest='command')

    # predict command
    pred_parser = subparsers.add_parser('predict', help='Run prediction on a recording')
    pred_parser.add_argument('--input',  required=True, help='Path to Muse 2 CSV file')
    pred_parser.add_argument('--task',   required=True,
                             choices=['activity', 'focus', 'emotion', 'stress'],
                             help='Mental state task to predict')
    pred_parser.add_argument('--pretty', action='store_true',
                             help='Pretty-print JSON output')

    args = parser.parse_args()

    if args.command == 'predict':
        try:
            result = predict(args.input, args.task)
        except Exception as e:
            result = {
                'status': 'error',
                'error':  str(e),
                'trace':  traceback.format_exc()
            }

        indent = 2 if args.pretty else None
        print(json.dumps(result, indent=indent))

    else:
        parser.print_help()


if __name__ == '__main__':
    main()
