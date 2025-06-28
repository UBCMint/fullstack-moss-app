import numpy as np

def compute_correlation(eeg_data, tmin_indices, tstart, tend):
    """
    Computes correlation and amplitude similarity between pairs of troughs.
    Args:
        eeg_data (numpy array): Filtered EEG signal (1D array)
        tmin_indices (list): Indices of detected troughs
        tstart (list): Start times for each trough
        tend (list): End times for each trough
    Returns:
        corrmat (numpy array): Correlation matrix for shape similarity
        powermat (numpy array): Power matrix for amplitude similarity
    """
    num_troughs = len(tmin_indices)
    corrmat = np.zeros((num_troughs, num_troughs))
    powermat = np.zeros((num_troughs, num_troughs))

    for i in range(num_troughs):
        for j in range(i + 1, num_troughs):
            siga = eeg_data[tstart[i]:tend[i]]
            sigb = eeg_data[tstart[j]:tend[j]]
            corrmat[i, j] = np.corrcoef(siga, sigb)[0, 1]
            std_siga = np.std(siga)
            std_sigb = np.std(sigb)
            powermat[i, j] = max(std_siga / std_sigb, std_sigb / std_siga)

    return corrmat, powermat

def high_corr_comp(corrmat, powermat, corr_thresh=0.8, power_thresh=1.5):
    """
    Identifies highly correlated blink components based on correlation and power similarity.
    Args:
        corrmat (numpy array): Correlation matrix for shape similarity
        powermat (numpy array): Power matrix for amplitude similarity
        corr_thresh (float): Threshold for correlation
        power_thresh (float): Threshold for power similarity
    Returns:
        index_blinks (list): List of indices of identified eye-blinks
    """
    index_blinks = []
    num_troughs = len(corrmat)

    for i in range(num_troughs):
        for j in range(i + 1, num_troughs):
            if corrmat[i, j] > corr_thresh and powermat[i, j] < power_thresh:
                index_blinks.append(i)
                index_blinks.append(j)

    return list(set(index_blinks))

def blink_typify_and_adjust(tstart, tmin, tend, index_blinks, initial_delta, corrmat, powermat):
    """
    Adjusts the delta value for peak detection based on identified blink correlations.
    Args:
        tstart (list): Start times of detected troughs
        tmin (list): Minimum (trough) times for each detected event
        tend (list): End times of the detected troughs
        index_blinks (list): Indices of identified eye-blinks
        initial_delta (float): Initial delta value for peak detection
        corrmat (numpy array): Correlation matrix
        powermat (numpy array): Power matrix
    Returns:
        adjusted_delta (float): Updated delta value for peak detection
    """
    avg_corr = np.mean(corrmat)
    avg_power = np.mean(powermat)
    
    if avg_corr > 0.9 and avg_power < 1.2:
        adjusted_delta = initial_delta * 0.9  # Increase sensitivity
    elif avg_corr < 0.7 or avg_power > 1.8:
        adjusted_delta = initial_delta * 1.1  # Decrease sensitivity
    else:
        adjusted_delta = initial_delta

    return adjusted_delta