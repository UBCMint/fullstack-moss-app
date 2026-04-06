"""
MOSS - resampler.py
===================
Handles resampling of EEG signals to NeuroLM's expected sample rate (200Hz).

Different Muse datasets record at different rates:
  - Muse 2 via Mind Monitor: 256Hz
  - MuseLSL:                 250Hz
  - EKM-ED preprocessed:    128Hz

All are resampled to 200Hz before encoding.

Used by: preprocessing.py
"""

import numpy as np
from scipy import signal as scipy_signal

# ── Constants ──────────────────────────────────────────────────────────────────
TGT_FS = 200   # NeuroLM expected sample rate


def resample(eeg: np.ndarray,
             src_fs: int,
             tgt_fs: int = TGT_FS) -> np.ndarray:
    """
    Resample EEG from src_fs to tgt_fs using the Fourier method.

    Resamples each channel independently to avoid cross-channel artifacts.
    If src_fs == tgt_fs, returns the array unchanged.

    Args:
        eeg:    (n_samples, 4) float32 array
        src_fs: source sample rate in Hz
        tgt_fs: target sample rate in Hz (default 200)

    Returns:
        resampled: (n_out, 4) float32 array at tgt_fs
                   where n_out = n_samples * tgt_fs / src_fs
    """
    if src_fs == tgt_fs:
        return eeg

    n_out = int(eeg.shape[0] * tgt_fs / src_fs)
    resampled = np.stack(
        [scipy_signal.resample(eeg[:, c], n_out) for c in range(eeg.shape[1])],
        axis=1
    )
    return resampled.astype(np.float32)


def resample_channel(channel: np.ndarray,
                     src_fs: int,
                     tgt_fs: int = TGT_FS) -> np.ndarray:
    """
    Resample a single EEG channel.

    Args:
        channel: (n_samples,) float32 array
        src_fs:  source sample rate in Hz
        tgt_fs:  target sample rate in Hz

    Returns:
        resampled: (n_out,) float32 array at tgt_fs
    """
    if src_fs == tgt_fs:
        return channel
    n_out = int(len(channel) * tgt_fs / src_fs)
    return scipy_signal.resample(channel, n_out).astype(np.float32)


if __name__ == '__main__':
    # Quick test
    import sys
    sys.path.insert(0, '.')
    from loader import load_csv

    if len(sys.argv) < 2:
        print("Usage: python resampler.py path/to/recording.csv")
        sys.exit(1)

    eeg, src_fs = load_csv(sys.argv[1])
    print(f"Before resample: {eeg.shape}  @ {src_fs}Hz")

    eeg_resampled = resample(eeg, src_fs)
    print(f"After resample:  {eeg_resampled.shape}  @ {TGT_FS}Hz")
    print(f"Duration: {eeg_resampled.shape[0] / TGT_FS:.1f}s")
