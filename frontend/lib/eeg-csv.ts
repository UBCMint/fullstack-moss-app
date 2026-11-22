// Parses EEG/EMG CSVs exported by the backend (POST .../eeg_data/export) into
// chart data. The export header is `time,eeg1..eeg8,emg1..emg4`; channels the
// recording device doesn't have are empty cells. Older 4-channel files used
// `channel1..channel4` (also `ch1`, `signal1`, `signal_1`), read as eeg1..eeg4.

import {
    formatTimestamp,
    genericLayout,
    type ChannelGroup,
    type ChannelLayout,
    type DataPoint,
} from './channels';

export type ParsedEegCsv = {
    layout: ChannelLayout;
    points: DataPoint[];
};

const EMPTY: ParsedEegCsv = { layout: genericLayout(0, 0), points: [] };

/** Maps a header cell to its channel, or null if it isn't a channel column. */
function channelForHeader(
    header: string
): { group: ChannelGroup; index: number } | null {
    const match = /^(eeg|emg|channel|ch|signal_?)(\d+)$/.exec(header);
    if (!match) return null;
    const index = Number(match[2]) - 1;
    if (index < 0) return null;
    const group: ChannelGroup = match[1] === 'emg' ? 'emg' : 'eeg';
    return { group, index };
}

export function parseEegCsv(csvContent: string): ParsedEegCsv {
    const lines = csvContent.trim().split(/\r?\n/);
    if (lines.length < 2) return EMPTY;

    const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const timeIdx = header.findIndex((h) => h === 'time' || h === 'timestamp');
    if (timeIdx === -1) return EMPTY;

    const rows = lines
        .slice(1)
        .map((line) => line.split(',').map((c) => c.trim()));

    // CSV column of each channel, in channel order. A channel is only part of
    // the layout if some row has a value for it (the export always writes all
    // 12 columns, leaving absent channels empty).
    const columns: Record<ChannelGroup, number[]> = { eeg: [], emg: [] };
    header.forEach((h, col) => {
        const channel = channelForHeader(h);
        if (!channel || !rows.some((row) => row[col])) return;
        columns[channel.group][channel.index] = col;
    });
    // Drop gaps (e.g. eeg1 and eeg3 present but not eeg2) so indices stay dense
    const eegCols = columns.eeg.filter((c) => c !== undefined);
    const emgCols = columns.emg.filter((c) => c !== undefined);
    if (eegCols.length + emgCols.length === 0) return EMPTY;

    const points: DataPoint[] = [];
    for (const row of rows) {
        const rawTime = row[timeIdx];
        if (!rawTime) continue;
        const eeg = eegCols.map((col) => parseFloat(row[col]));
        const emg = emgCols.map((col) => parseFloat(row[col]));
        if ([...eeg, ...emg].some((v) => !Number.isFinite(v))) continue;
        points.push({ time: formatTimestamp(rawTime), rawTime, eeg, emg });
    }

    return {
        layout: genericLayout(eegCols.length, emgCols.length),
        points,
    };
}
