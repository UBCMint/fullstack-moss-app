import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Node, Edge } from '@xyflow/react';
import {
    INTO_SOURCE_MESSAGE,
    ML_FILTER_UNCONNECTED_MESSAGE,
    ML_NEEDS_FILTER_MESSAGE,
    ML_NO_INPUT_MESSAGE,
    NOT_CONNECTED_MESSAGE,
    OUTPUT_ENDPOINT_MESSAGE,
    SOURCE_FEEDS_WINDOW_MESSAGE,
    SOURCE_SINGLE_OUTPUT_MESSAGE,
    WINDOW_AFTER_SOURCE_MESSAGE,
    checkConnection,
    getNodeConnectionStatus,
    isWindowInputAllowed,
    preparePipelineStart,
    validatePipeline,
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

// Run this suite with the flag both unset and true to cover both configurations.
test('Artifact availability follows the feature flag', () => {
    const artifact = { ...source, id: 'artifact', type: 'artifact-node' };
    const result = preparePipelineStart(
        [source, windowNode, artifact],
        [connection],
        1
    );
    if (process.env.NEXT_PUBLIC_ENABLE_ARTIFACT_NODE === 'true') {
        assert.deepEqual(result.errors, []);
        assert.ok(result.payload);
        // unconnected, so not sent
        assert.equal(result.payload.nodes.length, 2);
    } else {
        assert.equal(result.payload, null);
        assert.ok(
            result.errors.some((error) => error.includes('artifact-node'))
        );
    }
});

test('unknown and missing node types block an otherwise valid pipeline', () => {
    for (const type of ['unknown-node', undefined, '']) {
        const result = preparePipelineStart(
            [source, windowNode, { ...source, id: 'invalid', type }],
            [connection],
            1
        );
        assert.equal(result.payload, null);
        assert.ok(
            result.errors.some((error) => error.includes('unavailable type'))
        );
    }
});

test('enabled editor-only nodes remain valid without being sent to the backend', () => {
    const editorNodes = [
        'resampling-node',
        'signal-graph-node',
        'label-node',
    ].map((type) => ({ ...source, id: type, type }));
    const result = preparePipelineStart(
        [source, windowNode, ...editorNodes],
        [connection],
        1
    );
    assert.deepEqual(result.errors, []);
    // unconnected, so not sent
    assert.equal(result.payload?.nodes.length, 2);
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

// ---------------------------------------------------------------------------
// Connection rules: one test per rule, covering the message users see while
// dragging, the error at Start, and the node it is attached to.
// ---------------------------------------------------------------------------

const n = (id: string, type: string): Node => ({
    id,
    type,
    position: { x: 0, y: 0 },
    data: {},
});
const e = (from: string, to: string): Edge => ({
    id: `${from}-${to}`,
    source: from,
    target: to,
});
const blockedMessage = (
    sourceType: string,
    targetType: string,
    sourceHasOtherOutgoing = false
) => {
    const check = checkConnection(
        sourceType,
        targetType,
        sourceHasOtherOutgoing
    );
    return check.allowed ? null : check.message;
};

test('rule: nothing can connect into the Source node', () => {
    for (const type of [
        'window-node',
        'filter-node',
        'machine-learning-node',
        'signal-graph-node',
    ]) {
        assert.equal(blockedMessage(type, 'source-node'), INTO_SOURCE_MESSAGE);
    }
    // At Start (e.g. a saved board) the Source node itself is highlighted.
    const result = validatePipeline(
        [source, windowNode, n('filter', 'filter-node')],
        [connection, e('filter', 'source')]
    );
    assert.ok(result.errors.includes(INTO_SOURCE_MESSAGE));
    assert.equal(result.nodeIssues['source'], INTO_SOURCE_MESSAGE);
});

test('rule: Source can only have one outgoing connection', () => {
    assert.equal(
        blockedMessage('source-node', 'window-node', true),
        SOURCE_SINGLE_OUTPUT_MESSAGE
    );
    assert.equal(
        blockedMessage('source-node', 'filter-node', true),
        SOURCE_SINGLE_OUTPUT_MESSAGE
    );
    assert.equal(blockedMessage('source-node', 'window-node', false), null);
    const filter = n('filter', 'filter-node');
    const result = validatePipeline(
        [source, windowNode, filter],
        [connection, e('source', 'filter')]
    );
    assert.ok(result.errors.includes(SOURCE_SINGLE_OUTPUT_MESSAGE));
    assert.equal(result.nodeIssues['source'], SOURCE_SINGLE_OUTPUT_MESSAGE);
});

test('rule: only Source can feed the Window node', () => {
    for (const type of ['filter-node', 'resampling-node', 'label-node']) {
        assert.equal(
            blockedMessage(type, 'window-node'),
            WINDOW_AFTER_SOURCE_MESSAGE
        );
    }
    assert.equal(blockedMessage('source-node', 'window-node'), null);
    const filter = n('filter', 'filter-node');
    const result = validatePipeline(
        [source, windowNode, filter],
        [e('source', 'filter'), e('filter', 'window')]
    );
    assert.ok(result.errors.includes(WINDOW_AFTER_SOURCE_MESSAGE));
    assert.equal(result.nodeIssues['window'], WINDOW_AFTER_SOURCE_MESSAGE);
});

test('rule: ML and Chart nodes are endpoints', () => {
    for (const from of ['machine-learning-node', 'signal-graph-node']) {
        for (const to of ['filter-node', 'resampling-node', 'label-node']) {
            assert.equal(blockedMessage(from, to), OUTPUT_ENDPOINT_MESSAGE);
        }
    }
    const result = validatePipeline(
        [
            source,
            windowNode,
            n('chart', 'signal-graph-node'),
            n('label', 'label-node'),
        ],
        [connection, e('window', 'chart'), e('chart', 'label')]
    );
    assert.ok(result.errors.includes(OUTPUT_ENDPOINT_MESSAGE));
    assert.equal(result.nodeIssues['chart'], OUTPUT_ENDPOINT_MESSAGE);
});

test('rule: exactly one Source and exactly one Window', () => {
    const twoSources = validatePipeline(
        [source, n('source2', 'source-node'), windowNode],
        [connection]
    );
    assert.ok(
        twoSources.errors.includes('Multiple Source nodes are not allowed.')
    );
    assert.ok(twoSources.nodeIssues['source']);
    assert.ok(twoSources.nodeIssues['source2']);

    const twoWindows = validatePipeline(
        [source, windowNode, n('window2', 'window-node')],
        [connection, e('source', 'window2')]
    );
    assert.ok(
        twoWindows.errors.includes('Multiple Window nodes are not allowed.')
    );
    assert.ok(twoWindows.nodeIssues['window']);
    assert.ok(twoWindows.nodeIssues['window2']);

    assert.ok(
        validatePipeline([windowNode], []).errors.includes(
            'Add a Source node before starting.'
        )
    );
    assert.ok(
        validatePipeline([source], []).errors.includes(
            'Add a Window node before starting.'
        )
    );
});

test('rule: the ML node needs a Filter directly before it', () => {
    for (const type of ['window-node', 'resampling-node', 'label-node']) {
        assert.equal(
            blockedMessage(type, 'machine-learning-node'),
            ML_NEEDS_FILTER_MESSAGE
        );
    }
    assert.equal(blockedMessage('filter-node', 'machine-learning-node'), null);

    const ml = n('ml', 'machine-learning-node');
    const filter = n('filter', 'filter-node');

    // Nothing connected: say what to connect, not "received raw input".
    const none = getNodeConnectionStatus(
        'ml',
        [source, windowNode, ml],
        [connection]
    );
    assert.deepEqual(none, { connected: false, hint: ML_NO_INPUT_MESSAGE });
    assert.ok(!ML_NO_INPUT_MESSAGE.toLowerCase().includes('raw'));

    // Something other than a Filter feeds it (e.g. a saved board).
    const notFilter = getNodeConnectionStatus(
        'ml',
        [source, windowNode, ml],
        [connection, e('window', 'ml')]
    );
    assert.deepEqual(notFilter, {
        connected: false,
        hint: ML_NEEDS_FILTER_MESSAGE,
    });

    // A Filter that is not itself connected to the pipeline.
    const loose = getNodeConnectionStatus(
        'ml',
        [source, windowNode, filter, ml],
        [connection, e('filter', 'ml')]
    );
    assert.deepEqual(loose, {
        connected: false,
        hint: ML_FILTER_UNCONNECTED_MESSAGE,
    });

    // Source -> Window -> Filter -> ML is connected.
    const ok = getNodeConnectionStatus(
        'ml',
        [source, windowNode, filter, ml],
        [connection, e('window', 'filter'), e('filter', 'ml')]
    );
    assert.deepEqual(ok, { connected: true, hint: null });
});

test('rule: ML cannot connect straight to Source', () => {
    assert.equal(
        blockedMessage('source-node', 'machine-learning-node'),
        SOURCE_FEEDS_WINDOW_MESSAGE
    );
    // Source wired straight to ML (Window left unconnected): the ML node is the
    // one highlighted, with the sentence saying to go through the Window first.
    const result = validatePipeline(
        [source, windowNode, n('ml', 'machine-learning-node')],
        [e('source', 'ml')]
    );
    assert.ok(result.errors.includes(SOURCE_FEEDS_WINDOW_MESSAGE));
    assert.equal(result.nodeIssues['ml'], SOURCE_FEEDS_WINDOW_MESSAGE);
});

test('rule: Filter-before-Window and Outputs-before-preprocessing can no longer happen', () => {
    // Dragging Source to anything but the Window is blocked, so there is no
    // way to build the two layouts the old warnings described.
    for (const type of [
        'filter-node',
        'machine-learning-node',
        'signal-graph-node',
        'resampling-node',
        'label-node',
    ]) {
        assert.equal(
            blockedMessage('source-node', type),
            SOURCE_FEEDS_WINDOW_MESSAGE
        );
    }
    // Valid boards never produce warnings.
    const valid = validatePipeline([source, windowNode], [connection]);
    assert.deepEqual(valid.warnings, []);
    assert.deepEqual(valid.errors, []);
});

test('rule: pipelines cannot contain cycles', () => {
    const a = n('a', 'filter-node');
    const b = n('b', 'resampling-node');
    const downstream = n('d', 'label-node');
    const cyclic = validatePipeline(
        [source, windowNode, a, b, downstream],
        [connection, e('window', 'a'), e('a', 'b'), e('b', 'a'), e('b', 'd')]
    );
    assert.ok(cyclic.errors.some((m) => m.includes('cycle')));
    assert.ok(cyclic.nodeIssues['a']);
    assert.ok(cyclic.nodeIssues['b']);
    // Only nodes on the cycle are highlighted, not what hangs off it.
    assert.equal(cyclic.nodeIssues['d'], undefined);

    const acyclic = validatePipeline(
        [source, windowNode, a, b],
        [connection, e('window', 'a'), e('a', 'b')]
    );
    assert.deepEqual(acyclic.errors, []);
});

test('rule: Filter, Resampling, Chart and Label nodes need a path back to Source', () => {
    for (const type of [
        'filter-node',
        'resampling-node',
        'signal-graph-node',
        'label-node',
    ]) {
        const node = n('x', type);
        assert.deepEqual(
            getNodeConnectionStatus(
                'x',
                [source, windowNode, node],
                [connection]
            ),
            { connected: false, hint: NOT_CONNECTED_MESSAGE }
        );
        assert.deepEqual(
            getNodeConnectionStatus(
                'x',
                [source, windowNode, node],
                [connection, e('window', 'x')]
            ),
            { connected: true, hint: null }
        );
    }
    // A node that only connects to other loose nodes is still not connected.
    const a = n('a', 'filter-node');
    const b = n('b', 'resampling-node');
    assert.equal(
        getNodeConnectionStatus(
            'b',
            [source, windowNode, a, b],
            [connection, e('a', 'b')]
        ).connected,
        false
    );
});

test('rule: disabled node types are reported on the node itself', () => {
    const result = validatePipeline(
        [source, windowNode, n('mystery', 'unknown-node')],
        [connection]
    );
    assert.ok(result.errors.some((m) => m.includes('unavailable type')));
    assert.ok(result.nodeIssues['mystery']?.includes('unavailable type'));
});

test('start returns the node issues so the editor can highlight them', () => {
    const result = preparePipelineStart(
        [source, windowNode, n('ml', 'machine-learning-node')],
        [e('source', 'ml')],
        1
    );
    assert.equal(result.payload, null);
    assert.equal(result.nodeIssues['ml'], SOURCE_FEEDS_WINDOW_MESSAGE);
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

test('EEG and EMG quality nodes are sent as signal_quality with their signal', () => {
    const at = (id: string, type: string, x: number): Node => ({
        id,
        type,
        position: { x, y: 0 },
        data: {},
    });
    const nodes = [
        source,
        windowNode,
        at('eeg', 'eeg-quality-node', 200),
        at('emg', 'emg-quality-node', 300),
    ];
    const edges: Edge[] = [
        connection,
        { id: 'w-eeg', source: 'window', target: 'eeg' },
        { id: 'eeg-emg', source: 'eeg', target: 'emg' },
    ];
    const result = preparePipelineStart(nodes, edges, 7);
    assert.deepEqual(result.errors, []);
    const sent = result.payload!.nodes.filter(
        (n) => n.type === 'signal_quality'
    );
    assert.deepEqual(sent, [
        { id: 'eeg', type: 'signal_quality', config: { signal: 'eeg' } },
        { id: 'emg', type: 'signal_quality', config: { signal: 'emg' } },
    ]);
    assert.deepEqual(getNodeConnectionStatus('emg', nodes, edges), {
        connected: true,
        hint: null,
    });
});
