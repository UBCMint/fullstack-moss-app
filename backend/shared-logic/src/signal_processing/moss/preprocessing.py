"""
MOSS - preprocessing.py
=======================
Handles all EEG signal preprocessing:
  - CSV loading (Mind Monitor + MuseLSL formats)
  - Sample rate detection
  - Resampling to 200Hz
  - Segmentation into 4-second windows

Input:  path to a Muse 2 CSV file
Output: list of (4, 800) numpy arrays — one per segment

Used by: coordinator.py
"""

import numpy as np
import pandas as pd
from scipy import signal as scipy_signal
from typing import Optional

# ── Constants ──────────────────────────────────────────────────────────────────
TGT_FS       = 200      # NeuroLM expected sample rate (Hz)
WIN_SEC      = 4        # window length in seconds
STEP_SEC     = 2        # step size (50% overlap)
WIN_SAMPLES  = TGT_FS * WIN_SEC    # 800 samples per window
STEP_SAMPLES = TGT_FS * STEP_SEC   # 400 samples per step
DEFAULT_FS   = 256      # fallback sample rate if detection fails

# Column names for different Muse export formats
MIND_MONITOR_COLS = ['RAW_TP9', 'RAW_AF7', 'RAW_AF8', 'RAW_TP10']
MUSELSL_COLS      = ['TP9', 'AF7', 'AF8', 'TP10']
EXPORT_COLS       = ['channel1', 'channel2', 'channel3', 'channel4']

# Canonical channel order used throughout MOSS
CHANNEL_NAMES = ['TP9', 'AF7', 'AF8', 'TP10']


def load_csv(filepath: str) -> tuple[np.ndarray, int]:
    """
    Load a Muse 2 CSV file and return raw EEG as a numpy array.

    Supports three export formats:
      - Mind Monitor:  RAW_TP9, RAW_AF7, RAW_AF8, RAW_TP10
      - MuseLSL:       TP9, AF7, AF8, TP10
      - Direct export: channel1, channel2, channel3, channel4

    Returns:
        eeg:    np.ndarray of shape (n_samples, 4), dtype float32
        src_fs: detected sample rate in Hz
    """
    df = pd.read_csv(filepath)
    cols = df.columns.tolist()

    # Detect column format
    if 'RAW_TP9' in cols:
        eeg_cols = MIND_MONITOR_COLS
        ts_col   = 'TimeStamp' if 'TimeStamp' in cols else None
    elif 'TP9' in cols:
        eeg_cols = MUSELSL_COLS
        ts_col   = 'timestamps' if 'timestamps' in cols else None
    elif 'channel1' in cols:
        eeg_cols = EXPORT_COLS
        ts_col   = 'time' if 'time' in cols else None
    else:
        raise ValueError(
            f"Unrecognized CSV format. Expected RAW_TP9/AF7/AF8/TP10, "
            f"TP9/AF7/AF8/TP10, or channel1-4. Got columns: {cols[:10]}"
        )

    df = df[([ts_col] if ts_col else []) + eeg_cols].dropna(subset=eeg_cols)
    eeg = df[eeg_cols].values.astype(np.float32)

    # Detect sample rate from timestamps
    src_fs = _detect_sample_rate(df, ts_col)

    return eeg, src_fs


def _detect_sample_rate(df: pd.DataFrame, ts_col: Optional[str]) -> int:
    """Estimate sample rate from timestamp column, fallback to DEFAULT_FS."""
    if ts_col is None or ts_col not in df.columns:
        return DEFAULT_FS
    try:
        ts = pd.to_datetime(df[ts_col])
        dt = (ts.iloc[-1] - ts.iloc[0]).total_seconds()
        if dt > 0:
            fs = int(round(len(df) / dt))
            return max(100, min(512, fs))   # clamp to sane range
    except Exception:
        pass

    try:
        # MuseLSL format: unix epoch floats
        ts = df[ts_col].values.astype(float)
        diffs = np.diff(ts)
        diffs = diffs[diffs > 0]
        if len(diffs) > 10:
            fs = int(round(1.0 / np.median(diffs)))
            return max(100, min(512, fs))
    except Exception:
        pass

    return DEFAULT_FS


def resample(eeg: np.ndarray, src_fs: int, tgt_fs: int = TGT_FS) -> np.ndarray:
    """
    Resample EEG from src_fs to tgt_fs using Fourier method.

    Args:
        eeg:    (n_samples, 4) array
        src_fs: source sample rate
        tgt_fs: target sample rate (default 200Hz)

    Returns:
        resampled: (n_out, 4) array at tgt_fs
    """
    if src_fs == tgt_fs:
        return eeg
    n_out = int(eeg.shape[0] * tgt_fs / src_fs)
    return np.stack(
        [scipy_signal.resample(eeg[:, c], n_out) for c in range(eeg.shape[1])],
        axis=1
    ).astype(np.float32)


def from_array(raw: np.ndarray,
               src_fs: int,
               channel_order: Optional[list[str]] = None) -> tuple[list[np.ndarray], float]:
    """
    Preprocess a raw EEG numpy array directly — no CSV needed.
    Use this for real-time streaming from the Muse 2 headset via LSL.

    Args:
        raw:           (n_samples, 4) float32 array, channels in order
                       [TP9, AF7, AF8, TP10] by default
        src_fs:        sample rate of the incoming data (e.g. 256 for Muse 2)
        channel_order: list of 4 channel names if different from default
                       default: ['TP9', 'AF7', 'AF8', 'TP10']

    Returns:
        segments: list of (4, 800) numpy arrays
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

    eeg = raw.astype(np.float32)
    eeg = resample(eeg, src_fs)

    duration = eeg.shape[0] / TGT_FS
    if duration < WIN_SEC:
        raise ValueError(
            f"Array too short: {duration:.1f}s. Need at least {WIN_SEC}s."
        )

    segments = segment(eeg)
    return segments, duration


def segment(eeg: np.ndarray,
            win_samples: int = WIN_SAMPLES,
            step_samples: int = STEP_SAMPLES) -> list[np.ndarray]:
    """
    Slice EEG into overlapping windows.

    Args:
        eeg:          (n_samples, 4) array at TGT_FS
        win_samples:  samples per window (default 800 = 4s @ 200Hz)
        step_samples: step size (default 400 = 2s, 50% overlap)

    Returns:
        segments: list of (4, win_samples) arrays — channels first
    """
    segs, start = [], 0
    while start + win_samples <= eeg.shape[0]:
        seg = eeg[start:start + win_samples, :].T   # (4, 800)
        segs.append(seg)
        start += step_samples
    return segs


def preprocess(filepath: str) -> tuple[list[np.ndarray], int, float]:
    """
    Full preprocessing pipeline: load → resample → segment.

    Args:
        filepath: path to Muse 2 CSV file

    Returns:
        segments: list of (4, 800) numpy arrays
        src_fs:   detected source sample rate
        duration: recording duration in seconds

    Raises:
        ValueError: if CSV format unrecognized or recording too short
    """
    eeg, src_fs = load_csv(filepath)
    eeg = resample(eeg, src_fs)

    duration = eeg.shape[0] / TGT_FS
    if duration < WIN_SEC:
        raise ValueError(
            f"Recording too short: {duration:.1f}s. Need at least {WIN_SEC}s."
        )

    segments = segment(eeg)
    return segments, src_fs, duration


if __name__ == '__main__':
    # Quick test
    import sys
    if len(sys.argv) < 2:
        print("Usage: python preprocessing.py path/to/recording.csv")
        sys.exit(1)

    segs, fs, dur = preprocess(sys.argv[1])
    print(f"Sample rate detected: {fs} Hz")
    print(f"Duration: {dur:.1f}s")
    print(f"Segments: {len(segs)} x {segs[0].shape}")
