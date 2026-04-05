"""
MOSS - loader.py
================
Handles loading Muse 2 EEG data from CSV files.
Supports all three Muse export formats and auto-detects sample rate.

Supported formats:
  - Mind Monitor app:  RAW_TP9, RAW_AF7, RAW_AF8, RAW_TP10
  - MuseLSL:           TP9, AF7, AF8, TP10
  - Direct export:     channel1, channel2, channel3, channel4

Used by: preprocessing.py
"""

import numpy as np
import pandas as pd
from typing import Optional

# ── Constants ──────────────────────────────────────────────────────────────────
DEFAULT_FS = 256   # fallback sample rate if detection fails

# Column names per export format
MIND_MONITOR_COLS = ['RAW_TP9', 'RAW_AF7', 'RAW_AF8', 'RAW_TP10']
MUSELSL_COLS      = ['TP9', 'AF7', 'AF8', 'TP10']
EXPORT_COLS       = ['channel1', 'channel2', 'channel3', 'channel4']

# Canonical channel order used throughout MOSS
CHANNEL_NAMES = ['TP9', 'AF7', 'AF8', 'TP10']


def load_csv(filepath: str) -> tuple[np.ndarray, int]:
    """
    Load a Muse 2 CSV file and return raw EEG as a numpy array.

    Args:
        filepath: path to Muse 2 CSV file

    Returns:
        eeg:    (n_samples, 4) float32 array, channels = [TP9, AF7, AF8, TP10]
        src_fs: detected sample rate in Hz

    Raises:
        ValueError: if the CSV format is not recognized
    """
    df   = pd.read_csv(filepath)
    cols = df.columns.tolist()

    # Detect which export format this is
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

    df  = df[([ts_col] if ts_col else []) + eeg_cols].dropna(subset=eeg_cols)
    eeg = df[eeg_cols].values.astype(np.float32)

    src_fs = detect_sample_rate(df, ts_col)

    return eeg, src_fs


def detect_sample_rate(df: pd.DataFrame,
                       ts_col: Optional[str],
                       default: int = DEFAULT_FS) -> int:
    """
    Estimate sample rate from a timestamp column.
    Falls back to default if timestamps are unavailable or unparseable.

    Args:
        df:      DataFrame containing the timestamp column
        ts_col:  name of the timestamp column (None if not present)
        default: fallback sample rate

    Returns:
        sample rate in Hz (clamped to 100-512 range)
    """
    if ts_col is None or ts_col not in df.columns:
        return default

    # Try parsing as datetime strings (Mind Monitor format)
    try:
        ts = pd.to_datetime(df[ts_col])
        dt = (ts.iloc[-1] - ts.iloc[0]).total_seconds()
        if dt > 0:
            fs = int(round(len(df) / dt))
            return max(100, min(512, fs))
    except Exception:
        pass

    # Try parsing as unix epoch floats (MuseLSL format)
    try:
        ts    = df[ts_col].values.astype(float)
        diffs = np.diff(ts)
        diffs = diffs[diffs > 0]
        if len(diffs) > 10:
            fs = int(round(1.0 / np.median(diffs)))
            return max(100, min(512, fs))
    except Exception:
        pass

    return default


if __name__ == '__main__':
    import sys
    if len(sys.argv) < 2:
        print("Usage: python loader.py path/to/recording.csv")
        sys.exit(1)

    eeg, fs = load_csv(sys.argv[1])
    print(f"Loaded: {eeg.shape}  |  Sample rate: {fs} Hz")
    print(f"Duration: {eeg.shape[0] / fs:.1f}s")
    print(f"Channels: {CHANNEL_NAMES}")
