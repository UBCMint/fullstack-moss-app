"""
MOSS - preprocessing.py
=======================
Orchestrates the full EEG preprocessing pipeline:
  load -> resample -> segment

This is the main entry point for preprocessing.
Each step is implemented in its own module:
  loader.py    — CSV loading + sample rate detection
  resampler.py — resampling to 200Hz
  segmenter.py — slicing into 4-second windows

Input:  path to a Muse 2 CSV file  (or raw numpy array for LSL streaming)
Output: list of (4, 800) numpy arrays — one per segment

Used by: coordinator.py
"""

import numpy as np
from typing import Optional

from loader    import load_csv, CHANNEL_NAMES
from resampler import resample, TGT_FS
from segmenter import segment, WIN_SEC, WIN_SAMPLES, STEP_SAMPLES


def preprocess(filepath: str) -> tuple[list[np.ndarray], int, float]:
    """
    Full preprocessing pipeline from CSV file: load -> resample -> segment.

    Args:
        filepath: path to Muse 2 CSV file (any supported format)

    Returns:
        segments: list of (4, 800) numpy arrays, ready for encoder.py
        src_fs:   detected source sample rate in Hz
        duration: recording duration in seconds

    Raises:
        ValueError: if CSV format unrecognized or recording too short
    """
    # Step 1 — Load
    eeg, src_fs = load_csv(filepath)

    # Step 2 — Resample to 200Hz
    eeg = resample(eeg, src_fs)

    # Step 3 — Validate duration
    duration = eeg.shape[0] / TGT_FS
    if duration < WIN_SEC:
        raise ValueError(
            f"Recording too short: {duration:.1f}s. Need at least {WIN_SEC}s."
        )

    # Step 4 — Segment into windows
    segments = segment(eeg)

    return segments, src_fs, duration


def from_array(raw: np.ndarray,
               src_fs: int,
               channel_order: Optional[list[str]] = None
               ) -> tuple[list[np.ndarray], float]:
    """
    Full preprocessing pipeline from a raw numpy array.
    Use this for real-time streaming from the Muse 2 headset via LSL.

    Args:
        raw:           (n_samples, 4) float32 array
                       channels in order [TP9, AF7, AF8, TP10] by default
        src_fs:        sample rate of the incoming data (e.g. 256 for Muse 2)
        channel_order: list of 4 channel names if different from default

    Returns:
        segments: list of (4, 800) numpy arrays, ready for encoder.py
        duration: recording duration in seconds

    Example (LSL stream):
        from pylsl import StreamInlet, resolve_stream
        streams = resolve_stream('type', 'EEG')
        inlet = StreamInlet(streams[0])
        samples, _ = inlet.pull_chunk(max_samples=1024)
        raw = np.array(samples, dtype=np.float32)
        segments, duration = from_array(raw, src_fs=256)
    """
    if raw.ndim != 2 or raw.shape[1] != 4:
        raise ValueError(
            f"Expected (n_samples, 4) array, got shape {raw.shape}"
        )

    eeg = resample(raw.astype(np.float32), src_fs)

    duration = eeg.shape[0] / TGT_FS
    if duration < WIN_SEC:
        raise ValueError(
            f"Array too short: {duration:.1f}s. Need at least {WIN_SEC}s."
        )

    segments = segment(eeg)
    return segments, duration


if __name__ == '__main__':
    import sys
    if len(sys.argv) < 2:
        print("Usage: python preprocessing.py path/to/recording.csv")
        sys.exit(1)

    segs, fs, dur = preprocess(sys.argv[1])
    print(f"Sample rate detected: {fs} Hz")
    print(f"Duration:             {dur:.1f}s")
    print(f"Segments:             {len(segs)} x {segs[0].shape}")
    print(f"Channels:             {CHANNEL_NAMES}")
