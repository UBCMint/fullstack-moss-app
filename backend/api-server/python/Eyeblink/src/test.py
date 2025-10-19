import numpy as np
import os
import pandas as pd
import matplotlib.pyplot as plt
from scipy.signal import butter, lfilter
from dataclasses import dataclass
from typing import Tuple, List
import csv

from filter import apply_lowpass_filter
from identify_stable_points import detect_troughs, find_stable_points
from compute_accuracy import get_metrics
from eyeBlink_timestamps import BlinkDetector

@dataclass
class BlinkEvent:
    timestamp: float
    blink_type: int
    confidence: float

class EEGStream:
    def __init__(self, base_path: str, dataset_type: str = 'EEG-VR', file_name: str = None):
        self.sampling_rate = 250.0
        self.current_index = 0
        self.data_folder = os.path.join(base_path, dataset_type)
        if not os.path.exists(self.data_folder):
            raise FileNotFoundError(f"Dataset folder not found at: {self.data_folder}")

        if file_name:
            if os.path.isfile(os.path.join(self.data_folder, file_name)):
                self.list_of_files = [file_name]
            else:
                raise FileNotFoundError(f"Specified file not found: {file_name}")
        else:
            self.list_of_files = [f for f in os.listdir(self.data_folder) 
                                 if os.path.isfile(os.path.join(self.data_folder, f)) 
                                 and '_data' in f]

        if not self.list_of_files:
            raise FileNotFoundError(f"No data files found in {self.data_folder}")
        
        self.load_file(0)
        
    def load_file(self, file_idx: int):
        file_sig = self.list_of_files[file_idx]
        file_stim = file_sig.replace('_data', '_labels')
        print(f"Reading: {file_sig}, {file_stim}")
        
        self.data_sig = np.loadtxt(
            open(os.path.join(self.data_folder, file_sig), "rb"),
            delimiter=",", skiprows=5, usecols=(0,1,2)
        )
        self.data_sig = self.data_sig[0:(int(200*self.sampling_rate)+1),:]
        self.data_sig = self.data_sig[:,0:3]
        self.data_sig[:,0] = np.array(range(0,len(self.data_sig)))/self.sampling_rate
        self.corrupt_intervals, self.blinks = self._decode_stim(file_stim)
        self.data_sig[:,1] = self._lowpass(self.data_sig[:,1], 10, self.sampling_rate, 4)
        self.data_sig[:,2] = self._lowpass(self.data_sig[:,2], 10, self.sampling_rate, 4)
    
    def read(self) -> Tuple[np.ndarray, float]:
        """Simulate real-time reading of EEG data"""
        if self.current_index >= len(self.data_sig):
            return None, None  # End of data
        
        timestamp = self.data_sig[self.current_index, 0]
        data = self.data_sig[self.current_index, 1:3]  # Fp1 and Fp2 channels
        self.current_index += 1
        return data, timestamp
    
    def _lowpass(self, sig, fc, fs, butter_filt_order):
        B, A = butter(butter_filt_order, np.array(fc)/(fs/2), btype='low')
        return lfilter(B, A, sig, axis=0)
    
    def _decode_stim(self, file_stim: str) -> Tuple[List, np.ndarray]:
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
        self.threshold = 100
        self.min_peak_distance = int(0.2 * self.sampling_rate)
        
    def detect_blink(self, data: np.ndarray, timestamp: float) -> BlinkEvent:
        eeg_avg = np.mean(data)
        if abs(eeg_avg) > self.threshold:
            confidence = min(abs(eeg_avg) / self.threshold, 1.0)
            return BlinkEvent(timestamp=timestamp, blink_type=0, confidence=confidence)
        return None

def visualize_troughs(eeg_stream, detected_blinks, channel_index=1):
    plt.figure(figsize=(12, 6))
    
    time_series = eeg_stream.data_sig[:, 0]
    channel_data = eeg_stream.data_sig[:, channel_index]
    plt.plot(time_series, channel_data, label=f'EEG Channel {channel_index}')

    detected_timestamps = [event.timestamp for event in detected_blinks]
    detected_amplitudes = [channel_data[int(event.timestamp * eeg_stream.sampling_rate)] for event in detected_blinks]
    plt.plot(detected_timestamps, detected_amplitudes, 'rx', label="Detected Troughs", markersize=8)

    for corrupt in eeg_stream.corrupt_intervals:
        plt.axvspan(corrupt[0], corrupt[1], alpha=0.3, color='red', label="Corrupt Interval" if corrupt == eeg_stream.corrupt_intervals[0] else "")

    # Flag to add the label for ground truth only once
    ground_truth_label_added = False
    for blink in eeg_stream.blinks:
        color = 'green' if blink[1] < 2 else 'black'
        label = "Ground Truth Blink" if not ground_truth_label_added else ""
        plt.axvline(x=blink[0], color=color, linestyle='--', label=label)
        ground_truth_label_added = True

    plt.legend(loc="upper right")
    plt.title(f"EEG Channel {channel_index} - Detected Troughs and Ground Truth Blinks")
    plt.xlabel("Time (s)")
    plt.ylabel("Amplitude")
    plt.show()

def main():
    ## Log the current working directory
    print("Current working directory:", os.getcwd())
    print("In test.py")
    base_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "EEG-Eyeblinks")
    dataset_type = 'EEG-VR'
    file_name = 'S00R_data.csv'

    eeg_stream = EEGStream(base_path, dataset_type, file_name)
    blink_detector = BlinkDetector()

    detected_blinks = []
    data_buffer = []

    min_detection_gap = 0.25
    last_detected_time = -float('inf')
    
    while True:
        eeg_data, timestamp = eeg_stream.read()
        if eeg_data is None:
            break
        if eeg_stream.is_corrupt(timestamp):
            continue

        data_buffer.append(eeg_data)
        if len(data_buffer) > blink_detector.window_size:
            data_buffer.pop(0)
        
        if len(data_buffer) == blink_detector.window_size:
            signal_window = np.array(data_buffer)[:, 0]
            trough_indices = detect_troughs(signal_window, prominence=100, distance=10)
            valid_troughs, trough_centers = find_stable_points(signal_window, trough_indices)
            
            for i, trough_idx in enumerate(valid_troughs):
                trough_center = trough_centers[i]
                absolute_trough_center_idx = eeg_stream.current_index - blink_detector.window_size + trough_center
                blink_timestamp = absolute_trough_center_idx / eeg_stream.sampling_rate

                if blink_timestamp - last_detected_time >= min_detection_gap:
                    blink_event = BlinkEvent(timestamp=blink_timestamp, blink_type=0, confidence=1.0)
                    detected_blinks.append(blink_event)
                    last_detected_time = blink_timestamp

    visualize_troughs(eeg_stream, detected_blinks)

if __name__ == "__main__":
    main()