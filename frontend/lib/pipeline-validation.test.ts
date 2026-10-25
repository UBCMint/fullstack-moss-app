import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Node, Edge } from '@xyflow/react';
import { preparePipelineStart } from './pipeline-validation';

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
            { type: 'window', config: { chunk_size: 128, overlap_size: 16 } },
        ],
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
    assert.equal(restarted.payload?.nodes[0].config.chunk_size, 256);
});
