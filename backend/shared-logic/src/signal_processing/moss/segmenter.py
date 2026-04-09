"""
MOSS - segmenter.py
===================
Handles slicing continuous EEG into fixed-length overlapping windows.

NeuroLM processes EEG in 4-second segments (800 samples @ 200Hz).
A 50% overlap (2s step) gives more predictions per recording and
smooths the output over time.

Used by: preprocessing.py
"""

import numpy as np
from typing import Optional

# ── Constants ──────────────────────────────────────────────────────────────────
TGT_FS       = 200   # expected sample rate after resampling
WIN_SEC      = 4     # window length in seconds
STEP_SEC     = 2     # step between windows (50% overlap)
WIN_SAMPLES  = TGT_FS * WIN_SEC    # 800 samples
STEP_SAMPLES = TGT_FS * STEP_SEC   # 400 samples


def segment(eeg: np.ndarray,
            win_samples: int = WIN_SAMPLES,
            step_samples: int = STEP_SAMPLES) -> list[np.ndarray]:
    """
    Slice a continuous EEG recording into overlapping windows.

    Args:
        eeg:          (n_samples, 4) array at TGT_FS (channels last)
        win_samples:  samples per window (default 800 = 4s @ 200Hz)
        step_samples: step between windows (default 400 = 2s, 50% overlap)

    Returns:
        segments: list of (4, win_samples) arrays — channels first
                  ready for NeuroLM encoder input

    Example:
        A 60s recording at 200Hz = 12,000 samples
        → 29 segments of (4, 800) with 50% overlap
    """
    if eeg.ndim != 2 or eeg.shape[1] != 4:
        raise ValueError(
            f"Expected (n_samples, 4) array, got shape {eeg.shape}"
        )

    segs, start = [], 0
    while start + win_samples <= eeg.shape[0]:
        seg = eeg[start:start + win_samples, :].T   # (4, 800) channels first
        segs.append(seg)
        start += step_samples

    return segs


def segment_with_timestamps(eeg: np.ndarray,
                             fs: int = TGT_FS,
                             win_samples: int = WIN_SAMPLES,
                             step_samples: int = STEP_SAMPLES
                             ) -> list[dict]:
    """
    Slice EEG into windows and return each with its time range.

    Args:
        eeg:          (n_samples, 4) array
        fs:           sample rate (used to compute timestamps)
        win_samples:  samples per window
        step_samples: step between windows

    Returns:
        list of dicts:
          {
            'segment':  (4, win_samples) numpy array,
            'start_s':  float,
            'end_s':    float,
            'index':    int
          }
    """
    results = []
    start   = 0
    idx     = 0

    while start + win_samples <= eeg.shape[0]:
        seg = eeg[start:start + win_samples, :].T
        results.append({
            'segment': seg,
            'start_s': round(start / fs, 2),
            'end_s':   round((start + win_samples) / fs, 2),
            'index':   idx,
        })
        start += step_samples
        idx   += 1

    return results


def get_n_segments(n_samples: int,
                   win_samples: int = WIN_SAMPLES,
                   step_samples: int = STEP_SAMPLES) -> int:
    """
    Calculate how many segments a recording will produce without actually
    segmenting it. Useful for pre-allocating arrays.

    Args:
        n_samples:    total number of samples in the recording
        win_samples:  samples per window
        step_samples: step between windows

    Returns:
        number of segments
    """
    if n_samples < win_samples:
        return 0
    return (n_samples - win_samples) // step_samples + 1


if __name__ == '__main__':
    import sys
    sys.path.insert(0, '.')
    from loader import load_csv
    from resampler import resample

    if len(sys.argv) < 2:
        print("Usage: python segmenter.py path/to/recording.csv")
        sys.exit(1)

    eeg, src_fs = load_csv(sys.argv[1])
    eeg = resample(eeg, src_fs)
    segs = segment(eeg)

    print(f"Recording: {eeg.shape[0] / TGT_FS:.1f}s  ({eeg.shape[0]} samples @ {TGT_FS}Hz)")
    print(f"Segments:  {len(segs)} x {segs[0].shape}  ({WIN_SEC}s windows, {STEP_SEC}s step)")
    print(f"Expected:  {get_n_segments(eeg.shape[0])} segments")
