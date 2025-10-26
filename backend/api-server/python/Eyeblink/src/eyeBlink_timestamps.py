import numpy as np
import pandas as pd
import time
import os
from pathlib import Path
from typing import Tuple, List, Dict
import queue
from dataclasses import dataclass
from scipy.signal import butter, lfilter
import csv

from filter import apply_lowpass_filter
from identify_stable_points import detect_troughs, find_stable_points
from compute_accuracy import get_metrics

@dataclass
class BlinkEvent:
    timestamp: float
    blink_type: int  # 0: normal, 1: stimulation, 2: soft
    confidence: float

class EEGStream:
    def __init__(self, base_path: str, dataset_type: str = 'EEG-VR', file_name: str = None):
        """Initialize EEG stream with dataset"""
        self.sampling_rate = 250.0  # As specified in dataset
        self.current_index = 0
        
        # Construct full path to dataset
        self.data_folder = os.path.join(base_path, dataset_type)
        if not os.path.exists(self.data_folder):
            raise FileNotFoundError(f"Dataset folder not found at: {self.data_folder}")
        
        # Get list of data files
        if file_name:
            if os.path.isfile(os.path.join(self.data_folder, file_name)):
                self.list_of_files = [file_name]
            else:
                raise FileNotFoundError(f"Specified file not found: {file_name}")
        else:
            # Get list of data files
            self.list_of_files = [f for f in os.listdir(self.data_folder) 
                                 if os.path.isfile(os.path.join(self.data_folder, f)) 
                                 and '_data' in f]
        
        if not self.list_of_files:
            raise FileNotFoundError(f"No data files found in {self.data_folder}")
        
        # Load first file
        self.load_file(0)
        
    def load_file(self, file_idx: int):
        """Load data and labels from files"""
        file_sig = self.list_of_files[file_idx]
        file_stim = file_sig.replace('_data', '_labels')
        print(f"Reading: {file_sig}, {file_stim}")
        
        # Load EEG data based on dataset type
        if 'EEG-IO' in self.data_folder or 'EEG-MB' in self.data_folder:
            self.data_sig = np.loadtxt(
                open(os.path.join(self.data_folder, file_sig), "rb"),
                delimiter=";", skiprows=1, usecols=(0,1,2)
            )
        else:  # EEG-VR or EEG-VV
            self.data_sig = np.loadtxt(
                open(os.path.join(self.data_folder, file_sig), "rb"),
                delimiter=",", skiprows=5, usecols=(0,1,2)
            )
            self.data_sig = self.data_sig[0:(int(200*self.sampling_rate)+1),:]
            self.data_sig = self.data_sig[:,0:3]
            self.data_sig[:,0] = np.array(range(0,len(self.data_sig)))/self.sampling_rate
        
        # Load labels
        self.corrupt_intervals, self.blinks = self._decode_stim(file_stim)
        
        # Apply initial filtering
        self.data_sig[:,1] = self._lowpass(self.data_sig[:,1], 10, self.sampling_rate, 4)
        self.data_sig[:,2] = self._lowpass(self.data_sig[:,2], 10, self.sampling_rate, 4)
        
    def _lowpass(self, sig, fc, fs, butter_filt_order):
        """Lowpass filter implementation matching the original code"""
        B, A = butter(butter_filt_order, np.array(fc)/(fs/2), btype='low')
        return lfilter(B, A, sig, axis=0)
    
    def _decode_stim(self, file_stim: str) -> Tuple[List, np.ndarray]:
        """Decode stimulation file following original implementation"""
        interval_corrupt = []
        blinks = []
        n_corrupt = 0
        
        with open(os.path.join(self.data_folder, file_stim)) as csvfile:
            readCSV = csv.reader(csvfile, delimiter=',')
            for row in readCSV:
                if row[0] == "corrupt":
                    n_corrupt = int(row[1])
                elif n_corrupt > 0:
                    t_end = float(row[1]) if float(row[1]) != -1 else self.data_sig[-1,0]
                    interval_corrupt.append([float(row[0]), t_end])
                    n_corrupt -= 1
                elif row[0] == "blinks":
                    if n_corrupt != 0:
                        raise ValueError("Error in parsing stimulation file")
                else:
                    blinks.append([float(row[0]), int(row[1])])
        
        return interval_corrupt, np.array(blinks)

    def read(self) -> Tuple[np.ndarray, float]:
        """Simulate real-time reading of EEG data"""
        if self.current_index >= len(self.data_sig):
            return None, None
            
        timestamp = self.data_sig[self.current_index, 0]
        data = self.data_sig[self.current_index, 1:3]  # Fp1 and Fp2 channels
        self.current_index += 1
        
        return data, timestamp

    def is_corrupt(self, timestamp: float) -> bool:
        """Check if current timestamp falls in corrupt intervals"""
        for interval in self.corrupt_intervals:
            if interval[0] <= timestamp <= interval[1]:
                return True
        return False

    def get_ground_truth_blinks(self) -> np.ndarray:
        """Return ground truth blinks for validation"""
        return self.blinks

class BlinkDetector:
    def __init__(self):
        """Initialize blink detector with preprocessing parameters"""
        self.sampling_rate = 250.0
        self.window_size = int(0.5 * self.sampling_rate)  # 500ms window
        
        # Detection parameters based on dataset characteristics
        self.threshold = 100  # μV (adjustable based on calibration)
        self.min_peak_distance = int(0.2 * self.sampling_rate)  # Minimum 200ms between blinks
        
    def detect_blink(self, data: np.ndarray, timestamp: float) -> BlinkEvent:
        """Detect blinks in preprocessed EEG data"""
        # Average of Fp1 and Fp2 channels
        eeg_avg = np.mean(data)
        
        # Simple threshold-based detection
        if abs(eeg_avg) > self.threshold:
            confidence = min(abs(eeg_avg) / self.threshold, 1.0)
            return BlinkEvent(timestamp=timestamp, blink_type=0, confidence=confidence)
        
        return None

def main():
    # Set the base path to your dataset location
    base_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "EEG-Eyeblinks")
    dataset_type = "EEG-VR"  # Can be 'EEG-IO', 'EEG-VV', 'EEG-VR'
    file_name = 'S12R_data.csv'
    
    try:
        # Initialize EEG stream with dataset
        eeg_stream = EEGStream(base_path, dataset_type, file_name=file_name)
        
        # Initialize blink detector
        blink_detector = BlinkDetector()
        
        # Buffer for storing recent EEG data
        data_buffer = []
        
        print("Starting real-time EEG processing...")
        
        # Get ground truth blinks for validation
        ground_truth = eeg_stream.get_ground_truth_blinks()
        print(f"Total ground truth blinks: {len(ground_truth)}")
        
        detected_blinks = []
        last_detected_time = -float('inf')
        min_detection_gap = 0.25
        while True:
            # Read data
            eeg_data, timestamp = eeg_stream.read()
            
            if eeg_data is None:
                print("End of dataset reached")
                break
            
            # Skip corrupt intervals
            if eeg_stream.is_corrupt(timestamp):
                continue
            
            # Add to buffer
            data_buffer.append(eeg_data)
            if len(data_buffer) > blink_detector.window_size:
                data_buffer.pop(0)
            
            # Process when we have enough data
            if len(data_buffer) == blink_detector.window_size:
                # Detect blink
                signal_window = np.array(data_buffer)[:, 0]
                
                # Use detect_troughs and find_stable_points from detection.py
                trough_indices = detect_troughs(signal_window, prominence=100, distance=10)
                valid_troughs, trough_centers = find_stable_points(signal_window, trough_indices)
                
                for i, trough_idx in enumerate(valid_troughs):
                    # Calculate the timestamp at the center of the trough
                    trough_center = trough_centers[i]
                    absolute_trough_center_idx = eeg_stream.current_index - blink_detector.window_size + trough_center
                    blink_timestamp = absolute_trough_center_idx / eeg_stream.sampling_rate
                    
                    # Check time gap to avoid duplicate blink detection
                    if blink_timestamp - last_detected_time >= min_detection_gap:
                        blink_event = BlinkEvent(timestamp=blink_timestamp, blink_type=0, confidence=1.0)
                        detected_blinks.append(blink_event)
                        print(f"Blink detected at {blink_event.timestamp:.2f}s with confidence {blink_event.confidence:.2f}")
                    
                        last_detected_time = blink_timestamp
            # Simulate real-time processing
            time.sleep(1/eeg_stream.sampling_rate)
        
        metrics = get_metrics(ground_truth, detected_blinks)
        
        # Display metrics as a table
        metrics_df = pd.DataFrame([metrics])
        print("\nDetection Performance Metrics:")
        print(metrics_df)

        # Print summary
        print(f"\nProcessing complete:")
        print(f"Total detected blinks: {len(detected_blinks)}")
        
    except KeyboardInterrupt:
        print("\nStopping EEG processing...")
    except FileNotFoundError as e:
        print(f"\nError: {e}")
        print("Please check that the dataset path and structure are correct.")
    except Exception as e:
        print(f"\nUnexpected error: {e}")

if __name__ == "__main__":
    main()