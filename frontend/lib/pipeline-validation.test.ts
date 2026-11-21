import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Node, Edge } from '@xyflow/react';
import {
    isWindowInputAllowed,
    preparePipelineStart,
} from './pipeline-validation';

const source: Node = {
    id: 'source',
    type: 'source-node',
    position: { x: 0, y: 0 },
    data: {},
};
const windowNode: Node = {
    id: 'window',
    type: 'window-node',
    position: { x: 100, y: 0 },
    data: { config: { chunk_size: 128, overlap_size: 16 } },
};
const connection: Edge = {
    id: 'source-window',
    source: 'source',
    target: 'window',
};

test('empty and incomplete boards cannot start', () => {
    const empty = preparePipelineStart([], [], 1);
    assert.equal(empty.payload, null);
    assert.ok(empty.errors.includes('Add a Source node before starting.'));
    const missingWindow = preparePipelineStart([source], [], 1);
    assert.equal(missingWindow.payload, null);
    assert.deepEqual(missingWindow.errors, [
        'Add a Window node before starting.',
    ]);
});

test('an unconnected Window explains how to complete the board', () => {
    const result = preparePipelineStart([source, windowNode], [], 1);
    assert.equal(result.payload, null);
    assert.deepEqual(result.errors, [
        'Connect Window directly to Source before starting.',
    ]);
});

test('a valid board starts with its current configuration and session', () => {
    const result = preparePipelineStart([source, windowNode], [connection], 42);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.payload, {
        session_id: '42',
        nodes: [
            { id: 'source', type: 'source', config: {} },
            {
                id: 'window',
                type: 'window',
                config: { chunk_size: 128, overlap_size: 16 },
            },
        ],
        edges: [{ source: 'source', target: 'window' }],
    });
});

test('a missing session blocks an otherwise valid board', () => {
    const result = preparePipelineStart(
        [source, windowNode],
        [connection],
        null
    );
    assert.equal(result.payload, null);
    assert.deepEqual(result.errors, [
        'Wait for a session to be ready before starting.',
    ]);
});

test('invalid edits and reset do not reuse a previous valid payload', () => {
    assert.ok(
        preparePipelineStart([source, windowNode], [connection], 1).payload
    );
    assert.equal(
        preparePipelineStart([source, windowNode], [], 1).payload,
        null
    );
    assert.equal(preparePipelineStart([], [], 1).payload, null);
    const editedWindow = {
        ...windowNode,
        data: { config: { chunk_size: 256, overlap_size: 0 } },
    };
    const restarted = preparePipelineStart(
        [source, editedWindow],
        [connection],
        2
    );
    assert.equal(restarted.payload?.session_id, '2');
    assert.equal(restarted.payload?.nodes[1].config.chunk_size, 256);
});

test('only the source node may connect into the window node', () => {
    assert.equal(isWindowInputAllowed('source-node', 'window-node'), true);
    assert.equal(isWindowInputAllowed('filter-node', 'window-node'), false);
    assert.equal(
        isWindowInputAllowed('machine-learning-node', 'window-node'),
        false
    );
    assert.equal(isWindowInputAllowed('window-node', 'filter-node'), true);
    assert.equal(
        isWindowInputAllowed('window-node', 'machine-learning-node'),
        true
    );
    assert.equal(
        isWindowInputAllowed('window-node', 'signal-graph-node'),
        true
    );
});

test('the payload sends every node and edge so the backend can order the chain', () => {
    const filter: Node = {
        id: 'filter',
        type: 'filter-node',
        position: { x: 0, y: 0 },
        data: { config: { apply_bandpass: true, l_freq: 1, h_freq: 30 } },
    };
    const resample: Node = {
        id: 'resample',
        type: 'resampling-node',
        position: { x: 0, y: 0 },
        data: { rate: 'custom', customRate: 128 },
    };
    const chart: Node = {
        id: 'chart',
        type: 'signal-graph-node',
        position: { x: 0, y: 0 },
        data: {},
    };
    const result = preparePipelineStart(
        [chart, resample, filter, source, windowNode],
        [
            connection,
            { id: 'e1', source: 'window', target: 'resample' },
            { id: 'e2', source: 'resample', target: 'filter' },
            { id: 'e3', source: 'filter', target: 'chart' },
        ],
        7
    );
    assert.deepEqual(result.errors, []);
    const payload = result.payload!;
    assert.deepEqual(
        payload.nodes.map((n) => [n.id, n.type]),
        [
            ['source', 'source'],
            ['window', 'window'],
            ['resample', 'resample'],
            ['filter', 'preprocessing'],
            ['chart', 'signal_graph'],
        ]
    );
    assert.deepEqual(payload.edges, [
        { source: 'source', target: 'window' },
        { source: 'window', target: 'resample' },
        { source: 'resample', target: 'filter' },
        { source: 'filter', target: 'chart' },
    ]);
    assert.deepEqual(payload.nodes[2].config, { target_hz: 128 });
    assert.equal(payload.nodes[3].config.apply_quality_check, true);
    assert.equal(payload.nodes[3].config.h_freq, 30);
});

test('resampling at the original rate sends no target rate', () => {
    const resample: Node = {
        id: 'resample',
        type: 'resampling-node',
        position: { x: 0, y: 0 },
        data: { rate: 'input', customRate: 100 },
    };
    const result = preparePipelineStart(
        [source, windowNode, resample],
        [connection, { id: 'e', source: 'window', target: 'resample' }],
        1
    );
    assert.deepEqual(result.payload?.nodes[2].config, { target_hz: null });
});
