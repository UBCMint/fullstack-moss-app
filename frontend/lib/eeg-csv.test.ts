import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseEegCsv } from './eeg-csv';
import {
    describeLayout,
    genericLayout,
    groupsForView,
    isStreamMetadataMessage,
    resolveLayout,
} from './channels';

const FULL_HEADER =
    'time,eeg1,eeg2,eeg3,eeg4,eeg5,eeg6,eeg7,eeg8,emg1,emg2,emg3,emg4';

test('parses a full 12-channel export', () => {
    const csv = `${FULL_HEADER}\n2026-03-01T12:00:00.250+00:00,1,2,3,4,5,6,7,8,9,10,11,12.5\n`;
    const { layout, points } = parseEegCsv(csv);
    assert.equal(layout.eeg.length, 8);
    assert.equal(layout.emg.length, 4);
    assert.deepEqual(points, [
        {
            time: '12:00:00.250',
            rawTime: '2026-03-01T12:00:00.250+00:00',
            eeg: [1, 2, 3, 4, 5, 6, 7, 8],
            emg: [9, 10, 11, 12.5],
        },
    ]);
});

test('leaves out channels that are empty in every row', () => {
    const csv = `${FULL_HEADER}\n2026-03-01T12:00:00Z,1,2,3,4,,,,,,,,\n2026-03-01T12:00:01Z,5,6,7,8,,,,,,,,\n`;
    const { layout, points } = parseEegCsv(csv);
    assert.deepEqual(layout, genericLayout(4, 0));
    assert.deepEqual(
        points.map((p) => p.eeg),
        [
            [1, 2, 3, 4],
            [5, 6, 7, 8],
        ]
    );
});

test('reads legacy 4-channel headers as EEG', () => {
    const csv =
        'Time,Channel1,Channel2,Channel3,Channel4\n2026-03-01T12:00:00Z,1,2,3,4\n';
    const { layout, points } = parseEegCsv(csv);
    assert.deepEqual(layout, genericLayout(4, 0));
    assert.deepEqual(points[0].eeg, [1, 2, 3, 4]);
});

test('skips rows with a missing value and rejects files without time', () => {
    const csv =
        'time,eeg1,emg1\n2026-03-01T12:00:00Z,1,\n2026-03-01T12:00:01Z,2,3\n';
    assert.equal(parseEegCsv(csv).points.length, 1);
    assert.equal(parseEegCsv('eeg1\n1\n').points.length, 0);
});

test('recognises the stream metadata message', () => {
    assert.ok(
        isStreamMetadataMessage({
            type: 'metadata',
            channels: { eeg: ['TP9'], emg: [] },
        })
    );
    assert.ok(!isStreamMetadataMessage({ timestamps: [], eeg: [], emg: [] }));
    assert.ok(
        !isStreamMetadataMessage({ type: 'metadata', channels: { eeg: [1] } })
    );
});

test('uses the server layout only when it matches the data', () => {
    const point = { time: '', rawTime: '', eeg: [1, 2, 3, 4], emg: [] };
    const muse = { eeg: ['TP9', 'AF7', 'AF8', 'TP10'], emg: [] };
    assert.deepEqual(resolveLayout([point], muse), muse);
    // A stale 12-channel layout is ignored for 4-channel data
    assert.deepEqual(
        resolveLayout([point], genericLayout(8, 4)),
        genericLayout(4, 0)
    );
    assert.deepEqual(resolveLayout([], muse), muse);
});

test('limits group views to groups the layout has', () => {
    const eegOnly = genericLayout(4, 0);
    assert.deepEqual(groupsForView('both', eegOnly), ['eeg']);
    assert.deepEqual(groupsForView('emg', eegOnly), ['eeg']);
    assert.deepEqual(groupsForView('both', genericLayout(8, 4)), [
        'eeg',
        'emg',
    ]);
    assert.equal(describeLayout(genericLayout(8, 4)), '8 EEG · 4 EMG');
    assert.equal(describeLayout(eegOnly), '4 EEG');
});
