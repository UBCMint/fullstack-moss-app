import numpy as np
import mne
import scipy.signal
from scipy.signal import decimate
from mne.preprocessing import ICA

class signalProcessing:
    """Class containing various signal filters and processing functions"""
    
    #Fareesah: Downsample, calculating signal power, 
    #          surface laplacian derivation (spatial filter)
    #Anirudh: Bandpass filter (FIR and IIR), wavelet transform
    #Ian: FFT, ICA, Epoching
    
    #Aiming to have pseudocode by wednesday night, 
    #implementations by saturday night (ready for sunday meeting)
    #For implementations, if there is code available through existing libraries 
    #like MNE, use that rather than writing your own implementation
    
    #Pseudocode: Complete method signatures (method name, inputs, outputs, 
    #            comments explaing what the function does and where it may be
    #            used, comments explaining what the input arguments are)
    #
    # For functions like bandpass filters i think it would be a good idea to 
    # have default high/low pass frequencies that are used if the user does not 
    # specify an additional high/low pass frequency

    def fir_bandpass_filter(data, sfreq, l_freq=1.0, h_freq=50.0):
        # Apply a zero-phase FIR bandpass filter to the input signal.
        # This function removes frequencies outside the specified range
        # making it suitable for preprocessing EEG, ECG, and other biosignals.
    
        # Inputs:
        # - data: NumPy array of shape (n_channels, n_samples), where
        #         n_channels is the number of signal channels and 
        #         n_samples is the number of time points.
        # - sfreq: Sampling frequency of the signal in Hz.
        # - l_freq: Low cutoff frequency in Hz (default = 1.0 Hz).
        # - h_freq: High cutoff frequency in Hz (default = 50.0 Hz).
        #
        # Returns:
        # - Filtered data with the same shape as input.
        
        # Default cutoff values are set to remove very low-frequency drifts 
        # and high-frequency noise.

        filtered_data = mne.filter.filter_data(data, sfreq, l_freq, h_freq, method='fir')
        
        return filtered_data


    def iir_bandpass_filter(data, sfreq, l_freq=1.0, h_freq=50.0):
        # Apply an IIR bandpass filter to the input signal.
        # This function uses an infinite impulse response (IIR) filter 
        # to remove frequencies outside the given range.
        # Commonly used for real-time signal processing.
        
        # Inputs:
        # - data: NumPy array of shape (n_channels, n_samples).
        # - sfreq: Sampling frequency in Hz.
        # - l_freq: Low cutoff frequency in Hz (default = 1.0 Hz).
        # - h_freq: High cutoff frequency in Hz (default = 50.0 Hz).
        
        # Returns:
        # - Filtered data with the same shape as input.
        
        # Default values are chosen to remove unwanted low-frequency drifts 
        # and high-frequency noise.

        iir_params = mne.filter.construct_iir_filter(dict(ftype='butter', order=4), sfreq, l_freq, h_freq)
        filtered_data = scipy.signal.filtfilt(iir_params['b'], iir_params['a'], data, axis=-1)
        
        return filtered_data


    def wavelet_tfr_array_morlet(data, sfreq, freqs, n_cycles=7):
        # Compute the time-frequency representation (TFR) of the input signal 
        # using Morlet wavelets. Useful for analyzing 
        # non-stationary signals such as EEG and MEG data.
        #
        # Inputs:
        # - data: NumPy array of shape (n_channels, n_samples).
        # - sfreq: Sampling frequency in Hz.
        # - freqs: Array of frequencies at which to compute TFR.
        # - n_cycles: Number of cycles per frequency for wavelet transform 
        #            (default = 7, balancing time and frequency resolution).
        #
        # Returns:
        # - TFR array of shape (n_epochs=1, n_channels, n_frequencies, n_samples).

        tfr = mne.time_frequency.tfr_array_morlet(data[np.newaxis, :, :], sfreq, freqs, n_cycles, output='power')
        
        return tfr
    
    def fast_fourier_tfr(data, sfreq):
        """
        Uses the welch fast fourier transform to convert a time domain input 
        signal into a frequency domain output signal. Finds the power spectral
        density and frequency values for which the density was computed

        Parameters
        ----------
        data : Numpy array of shape (n_channels, n_samples)
               Incoming EEG data. Should be filtered before using FFT 
               
        sfreq : float
                Sampling rate of data in Hz

        Returns
        -------
        psd : Numpy ndarray of shape (n_channels, n_frequencies, n_timepoints)
              Contains power spectrum density information
              
        freqs: array of frequency values
        """
        
        psd, freqs = mne.time_frequency.psd_array_welch(data, sfreq)

        return psd, freqs
        
    
    def ica_rem_artifact(data, sfreq, n_components=None):
        """
        Uses independant component analysis to remove noise/artifacts
        in eeg data.

        Parameters
        ----------
        data : Numpy array of shape (n_channels, n_samples)
               Incoming EEG data. Typically should have already undergone
               FFT or wavelet transform
               
        n_components : int, optional
            Number of components for calculating ICA. The default is None.
            If no value is passed, the number of channels in @param data will
            be used.

        Returns
        -------
        cleaned_data : Numpy array of same shape as data (n_channels, n_samples)
                      Cleaned data with artifacts removed

        """
        
        n_channels = data.shape[0]
        
        if n_components is None:
            n_components = n_channels
    
        info = mne.create_info(ch_names=[f"EEG{i}" for i in range(n_channels)], sfreq=sfreq, ch_types="eeg")
        
        raw = mne.io.RawArray(data, info)

        ica = ICA(n_components=n_components, method='fastica', random_state=42)
        ica.fit(raw)
        
        corrs = np.abs(ica.get_components()).mean(axis=1)  # Average component magnitude
        threshold = np.percentile(corrs, 90)  # Select top 10% highest magnitude
        eog_indices = np.where(corrs > threshold)[0].tolist() 
        ica.exclude = eog_indices
        cleaned_raw = raw.copy()
        ica.apply(cleaned_raw)
        cleaned_data = cleaned_raw.get_data()  
        
        return cleaned_data
    
    
    def epoch(data, t_start, t_end, sfreq, events=None):
        """
        Sections data into epochs of a specified length around specified events.
        
        **NOTE: t_start and t_end are time durations (in seconds) around the
        event, not raw time signatures. 

        Parameters
        ----------
        data : Numpy array of (n_channels, n_samples)
            Incoming EEG data.
            
        events : NumPy array
                 Array containing time indices of user specified 
                 events in EEG data. If left as none, the mne.find_events method
                 will be used
                 
        t_start : float
            Time duration from event index to start epoch.
            eg: use -0.5 to start epoch 0.5 seconds before event
            
        t_end : float
            Time duration from event index to end epoch.

        Returns
        -------
        epoched_data : List of Numpy arrays, each containing one epoch of 
                       eeg data
        """
        n_channels = data.shape[0]
        info = mne.create_info(ch_names=[f"EEG{i}" for i in range(n_channels)], sfreq=sfreq, ch_types="eeg")
        
        raw = mne.io.RawArray(data, info)
        
        if events is None:
           events = mne.find_events(raw)
           
        epochs = mne.Epochs(raw, events, t_start, t_end)
        
        epoched_data = epochs.get_data()  # Shape will be (n_epochs, n_channels, n_samples_per_epoch)
        
        return epoched_data


    def downsample(data, factor):
        """
        Downsamples the input signal by a given factor.
        
        Parameters:
        - data: NumPy array of shape (n_channels, n_samples).
        - factor: Integer, the downsampling factor.
        
        Returns:
        - Downsampled data with reduced number of samples.
        """
        if factor <= 0:
            raise ValueError("Need positive integer.")
        
        return decimate(data, factor, axis=1, zero_phase=True)

  
   
    def compute_band_powers(tfr_or_psd, freqs, freq_bands = None):
        """
        Compute power in specified frequency bands for either Welch-PSD or Morlet-TFR output.
    
        Parameters
        ----------
        tfr_or_psd : numpy.ndarray
            Output from either the wavelet transform or fourier transform methods
            - If Welch PSD: Shape (n_channels, n_frequencies, n_timepoints) 
            - If Morlet TFR: Shape (n_epochs, n_channels, n_frequencies, n_times)
    
        freqs : numpy.ndarray
            Frequency values corresponding to the second dimension of `tfr_or_psd`.
    
        freq_bands : dict
            Dictionary where keys are band names and values are (low, high) frequency tuples.
    
        Returns
        -------
        band_power : dict
            Dictionary where keys are band names and values are arrays:
            - Welch PSD → (n_channels, n_timepoints)
            - Morlet TFR → (n_epochs, n_channels, n_times)
            Values of n_timepoints and n_times correspond to band powers at each
            time point
        """
        if freq_bands is None:
            freq_bands = {
            "delta": (0.5, 4),
            "theta": (4, 8),
            "alpha": (8, 12),
            "beta": (12, 30),
            "gamma": (30, 100)
            }
        
        
        band_power = {}
    
        for band, (low, high) in freq_bands.items():
            # Find indices in 'freqs' that fall in the specified range
            band_mask = (freqs >= low) & (freqs <= high)
            
            if tfr_or_psd.ndim == 3:  # Welch PSD (n_channels, n_frequencies, n_timepoints)
                band_power[band] = tfr_or_psd[:, :, band_mask].mean(axis=2)  # Shape: (n_channels, n_timepoints)
            
            elif tfr_or_psd.ndim == 4:  # Morlet TFR (n_epochs, n_channels, n_frequencies, n_times)
                band_power[band] = tfr_or_psd[:, :, band_mask, :].mean(axis=2)  # Shape: (n_epochs, n_channels, n_times)
    
        return band_power

    def surface_laplacian(data, neighbors):
        """
        Computes the surface Laplacian to enhance spatial resolution of EEG data.
        
        Parameters:
        - data: NumPy array of shape (n_channels, n_samples).
        - neighbors: List of lists specifying neighboring electrodes for each channel.
        
        Returns:
        - Spatially filtered EEG data.
        """

        laplacian_data = np.copy(data)

        for ch in range(len(neighbors)):
            if len(neighbors[ch]) == 0:
                continue

            avg_neighbour_signal = np.mean(data[neighbors[ch, :]], axis = 0)
            laplacian_data[ch, :] = data[ch,:] - avg_neighbour_signal

        return laplacian_data
        
        
        
        
        
