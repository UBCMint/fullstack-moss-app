# detects troughs in EEG data that could correspond to eye-blink events
# finds stable points around troughs to ensure they are valid 

import numpy as np
import scipy.signal as signal
import matplotlib.pyplot as plt

def detect_troughs(eeg_data, prominence=100, distance=10):
    """
    Detects troughs in the EEG data that could correspond to eye-blink events.
    
    Args:
        eeg_data (numpy array): Filtered EEG signal (1D array)
        prominence (float): Minimum prominence of peaks (troughs) to detect.
        distance (int): Minimum number of samples between detected troughs.
    Returns:
        trough_indices (numpy array)
    """
    # Invert to detect troughs as peaks
    inverted_signal = -eeg_data

    trough_indices = signal.find_peaks(inverted_signal, prominence=prominence, distance=distance)[0]

    return trough_indices

def find_stable_points(eeg_data, trough_indices, stable_window=50, stable_threshold=50, baseline_threshold=100):
    """
    For each detected trough, check for nearby stable points where the signal recovers from the trough.
    
    Args:
        eeg_data: Filtered EEG signal (1D array)
        trough_indices (list): Indices of detected troughs.
        stable_window (int): Window size after the trough to search for stable points.
        stable_threshold (float): Threshold for determining if a point is stable.
        baseline_threshold (float): Threshold for determining of signal returns to baseline.
    Returns:
        valid_troughs (list): Troughs with nearby stable points.
    """
    valid_troughs = []
    trough_centers = []

    for i, trough_idx in enumerate(trough_indices):
        # Edge case for end of signal
        if trough_idx + stable_window >= len(eeg_data):
            continue

        # Calculate stable points by looking at slope (low slope implies stability)
        # Define pre-trough and post-trough windows
        pre_trough_window = eeg_data[max(0, trough_idx - stable_window):trough_idx]
        post_trough_window = eeg_data[trough_idx:trough_idx + stable_window]

        # Find points with low slope (stable points) in both windows
        pre_slope = np.gradient(pre_trough_window)
        post_slope = np.gradient(post_trough_window)
        
        stable_pre_idx = np.where(np.abs(pre_slope) < stable_threshold)[0]
        stable_post_idx = np.where(np.abs(post_slope) < stable_threshold)[0]

        # Ensure stable points exist on both sides
        if len(stable_pre_idx) == 0 or len(stable_post_idx) == 0:
            continue

        # Identify the last stable point before the trough and the first stable point after
        stable_point_before = trough_idx - stable_window + stable_pre_idx[-1]
        stable_point_after = trough_idx + stable_post_idx[0]

        # Calculate center as midpoint between stable points
        trough_center = (stable_point_before + stable_point_after) // 2

        # Check if signal recovers close to baseline
        local_baseline = np.mean(eeg_data[max(0, trough_idx - stable_window):trough_idx])
        recovers_to_baseline = np.abs(eeg_data[stable_point_after] - local_baseline) < baseline_threshold

        # Valid trough if both stability conditions are met
        if recovers_to_baseline:
            valid_troughs.append(trough_idx)
            trough_centers.append(trough_center)

    return valid_troughs, trough_centers