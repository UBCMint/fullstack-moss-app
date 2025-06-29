# Applies lowpass filter to remove high-frequency noise in order to focus on low-frequency eye-blinks

import numpy as np
import scipy.signal as signal
import matplotlib.pyplot as plt

def apply_lowpass_filter(eeg_data, cutoff_frequency=30.0, sampling_rate = 250, order = 5):
    """
    Applies a low-pass Butterworth filter to the EEG data to remove high-frequency noise.

    Args:
        eeg_data (list): Raw EEG signal data (multiple channels).
        cutoff_frequency (float): The cutoff frequency for the low-pass filter. Frequency of 30 Hz is used due to eye-blink detection manifesting in lower-frequency bands (less brain activity)
        sampling_rate (float): The sampling rate of the EEG data.
    Returns:
        filtered_data (numpy array): The filtered EEG data with high-frequency noise
    """
    # Step 1: Normalize cutoff frequency
    nyquist_rate = 0.5 * sampling_rate
    normalized_cutoff = cutoff_frequency / nyquist_rate

    # Step 2: Butterworth low-pass filter
    b, a = signal.butter(order, normalized_cutoff, btype='low', analog=False)

    # Step 3: Apply filter to EEG data using filtfilt()
    filtered_data = signal.filtfilt(b, a, eeg_data, axis=0)
    return filtered_data