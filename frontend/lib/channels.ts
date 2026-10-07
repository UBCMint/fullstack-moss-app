export const NUM_EEG = 8;
export const NUM_EMG = 4;
export const NUM_CHANNELS = NUM_EEG + NUM_EMG;

export type ChannelType = 'eeg' | 'emg';

export const CHANNEL_LABELS: readonly string[] = [
    'EEG1',
    'EEG2',
    'EEG3',
    'EEG4',
    'EEG5',
    'EEG6',
    'EEG7',
    'EEG8',
    'EMG1',
    'EMG2',
    'EMG3',
    'EMG4',
];

export const CHANNEL_TYPES: readonly ChannelType[] = [
    'eeg',
    'eeg',
    'eeg',
    'eeg',
    'eeg',
    'eeg',
    'eeg',
    'eeg',
    'emg',
    'emg',
    'emg',
    'emg',
];

// Per-channel palette. EEG (0-7) in cool tones; EMG (8-11) in warm tones,
// so the two groups are visually distinguishable at a glance.
export const CHANNEL_COLORS: readonly string[] = [
    '#1f77b4',
    '#2ca02c',
    '#17becf',
    '#0000ff',
    '#008080',
    '#005f73',
    '#00a86b',
    '#0d585f',
    '#e74c3c',
    '#ff7f0e',
    '#d62728',
    '#c0392b',
];

export const CHANNEL_INDICES: readonly number[] = Array.from(
    { length: NUM_CHANNELS },
    (_, i) => i
);
