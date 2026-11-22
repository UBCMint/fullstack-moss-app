import type { Node, Edge } from '@xyflow/react';
import type { PipelinePayload } from './pipeline';
import { isNodeTypeEnabled } from './node-availability';

// defines backend types for React Flow types
const typeMap: Record<string, string> = {
    'source-node': 'source',
    'window-node': 'window',
    'filter-node': 'preprocessing',
    'resampling-node': 'resample',
    'artifact-node': 'artifact',
    'label-node': 'label',
    'machine-learning-node': 'ml',
    'signal-graph-node': 'signal_graph',
};

// allow for defaults of the filtering node to still be applied if user doesn't specify them in the UI
const DEFAULT_PROCESSING = {
    apply_bandpass: false,
    apply_quality_check: true,
    use_iir: false,
    l_freq: null,
    h_freq: null,
    downsample_factor: null,
    sfreq: 256,
    n_channels: 4,
};
const DEFAULT_WINDOWING = {
    chunk_size: 64,
    overlap_size: 0,
};

type NodeData = {
    config?: Record<string, unknown>;
    rate?: string;
    customRate?: number;
};

// 'input' keeps the original rate
const resampleConfig = (data: NodeData) => {
    const rate = data.rate ?? '256';
    if (rate === 'input') return { target_hz: null };
    const hz = rate === 'custom' ? data.customRate : Number(rate);
    return { target_hz: Number.isFinite(hz) ? hz : null };
};

const nodeConfig = (type: string, data: NodeData): Record<string, unknown> => {
    const config = data.config ?? {};
    switch (type) {
        case 'preprocessing':
            return { ...DEFAULT_PROCESSING, ...config };
        case 'window':
            return { ...DEFAULT_WINDOWING, ...config };
        case 'resample':
            return resampleConfig(data);
        default:
            return config;
    }
};

const topoSort = (nodes: Node[], edges: Edge[]) => {
    const incoming = new Map<string, number>(); // count of incoming edges for each node
    const outgoing = new Map<string, string[]>(); // list of target nodes for each node

    // Initialize maps to 0 incoming and empty outgoing
    nodes.forEach((n) => {
        incoming.set(n.id, 0);
        outgoing.set(n.id, []);
    });

    edges.forEach((e) => {
        if (!outgoing.has(e.source)) return;
        outgoing.get(e.source)!.push(e.target); // Add target to outgoing list of source
        incoming.set(e.target, (incoming.get(e.target) ?? 0) + 1); // Increment incoming count for target
    });

    const queue = nodes
        .filter((n) => (incoming.get(n.id) ?? 0) === 0)
        .map((n) => n.id);

    const ordered: string[] = [];

    // Kahn's algorithm for topological sorting
    while (queue.length > 0) {
        const id = queue.shift()!;
        ordered.push(id);

        for (const target of outgoing.get(id) ?? []) {
            const next = (incoming.get(target) ?? 0) - 1;
            incoming.set(target, next);
            if (next === 0) queue.push(target);
        }
    }

    // In case of cycles or disconnected nodes
    nodes.forEach((n) => {
        if (!ordered.includes(n.id)) ordered.push(n.id);
    });

    return ordered.map((id) => nodes.find((n) => n.id === id)!).filter(Boolean);
};

// ---------------------------------------------------------------------------
// Connection rules: the single source of truth.
//
// Every rule about which nodes may connect lives here and returns the sentence
// the user should see. The editor (drag-time), `validatePipeline` (Start-time)
// and the node cards all call these, so a rule can't be enforced in one place
// and silently missing in another. To add a rule: add a message, add a branch
// to `checkConnection`, and add a test in pipeline-validation.test.ts. See
// "Pipeline connection rules" in frontend/README.md.
// ---------------------------------------------------------------------------

export const INTO_SOURCE_MESSAGE =
    'The source node is always the start of a pipeline. Nothing can connect into it.';
export const SOURCE_SINGLE_OUTPUT_MESSAGE =
    'The source node can only connect to one node. Connect it to the Window node, then build from there.';
export const SOURCE_FEEDS_WINDOW_MESSAGE =
    'The source node has to connect to the Window node first. Connect it to the Window node, then build from there.';
export const WINDOW_AFTER_SOURCE_MESSAGE =
    'The window node has to come straight after the source.';
export const OUTPUT_ENDPOINT_MESSAGE =
    'The ML and Chart nodes are endpoints. Nothing can come after them.';
export const ML_NEEDS_FILTER_MESSAGE =
    'The ML node needs a Filter node directly before it. Connect a Filter node to its input.';
export const ML_NO_INPUT_MESSAGE =
    "Connect a Filter node to this node's input.";
export const ML_FILTER_UNCONNECTED_MESSAGE =
    'Connect the Filter node to the pipeline. It needs a path back to the Source node.';
export const NOT_CONNECTED_MESSAGE =
    'Connect this node to the pipeline. It needs a path back to the Source node.';

/** Nodes that produce an end result; nothing may follow them. */
const OUTPUT_NODE_TYPES = new Set([
    'signal-graph-node',
    'machine-learning-node',
]);

export type ConnectionRule =
    | 'into-source'
    | 'output-endpoint'
    | 'source-single-output'
    | 'source-feeds-window'
    | 'window-input'
    | 'ml-needs-filter';

export type ConnectionCheck =
    | { allowed: true }
    | {
          allowed: false;
          rule: ConnectionRule;
          /** One sentence telling the user what to do. */
          message: string;
          /** Which end of the connection to highlight when this is found at Start. */
          blame: 'source' | 'target';
      };

const blocked = (
    rule: ConnectionRule,
    message: string,
    blame: 'source' | 'target'
): ConnectionCheck => ({ allowed: false, rule, message, blame });

// Only the source node may feed the window node's input. Anything may follow the window.
export function isWindowInputAllowed(
    sourceType: string | undefined,
    targetType: string | undefined
) {
    return targetType !== 'window-node' || sourceType === 'source-node';
}

/**
 * Decide whether `sourceType -> targetType` is an allowed connection.
 * `sourceHasOtherOutgoing` is true when the source node already has another
 * outgoing connection. Rules are checked in the order users are most likely to
 * need them explained.
 */
export function checkConnection(
    sourceType: string | undefined,
    targetType: string | undefined,
    sourceHasOtherOutgoing: boolean
): ConnectionCheck {
    if (targetType === 'source-node') {
        return blocked('into-source', INTO_SOURCE_MESSAGE, 'target');
    }
    if (sourceType && OUTPUT_NODE_TYPES.has(sourceType)) {
        return blocked('output-endpoint', OUTPUT_ENDPOINT_MESSAGE, 'source');
    }
    if (sourceType === 'source-node') {
        if (sourceHasOtherOutgoing) {
            return blocked(
                'source-single-output',
                SOURCE_SINGLE_OUTPUT_MESSAGE,
                'source'
            );
        }
        if (targetType !== 'window-node') {
            return blocked(
                'source-feeds-window',
                SOURCE_FEEDS_WINDOW_MESSAGE,
                'target'
            );
        }
    }
    if (!isWindowInputAllowed(sourceType, targetType)) {
        return blocked('window-input', WINDOW_AFTER_SOURCE_MESSAGE, 'target');
    }
    if (
        targetType === 'machine-learning-node' &&
        sourceType !== 'filter-node'
    ) {
        return blocked('ml-needs-filter', ML_NEEDS_FILTER_MESSAGE, 'target');
    }
    return { allowed: true };
}

/** `checkConnection` for a pair of nodes on a board (a connection being dragged). */
export function checkNodeConnection(
    sourceNode: Pick<Node, 'id' | 'type'>,
    targetNode: Pick<Node, 'id' | 'type'>,
    edges: Edge[]
): ConnectionCheck {
    return checkConnection(
        sourceNode.type,
        targetNode.type,
        edges.some((e) => e.source === sourceNode.id)
    );
}

/** True when `nodeId` has an upstream path back to a Source node. */
const reachesSource = (nodeId: string, nodes: Node[], edges: Edge[]) => {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const visited = new Set<string>();
    const stack = [nodeId];
    while (stack.length > 0) {
        const current = stack.pop()!;
        if (visited.has(current)) continue;
        visited.add(current);
        for (const edge of edges) {
            if (edge.target !== current) continue;
            const upstream = byId.get(edge.source);
            if (!upstream) continue;
            if (upstream.type === 'source-node') return true;
            stack.push(upstream.id);
        }
    }
    return false;
};

/**
 * Whether a node is "connected" (the black vs. grey circles) and, if not, the
 * one sentence explaining what to do. The ML node needs more than a path to
 * Source: a Filter node directly before it.
 */
export function getNodeConnectionStatus(
    nodeId: string,
    nodes: Node[],
    edges: Edge[]
): { connected: boolean; hint: string | null } {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return { connected: false, hint: null };

    if (node.type === 'machine-learning-node') {
        const byId = new Map(nodes.map((n) => [n.id, n]));
        const upstream = edges
            .filter((e) => e.target === nodeId)
            .map((e) => byId.get(e.source))
            .filter((n): n is Node => Boolean(n));
        if (upstream.length === 0) {
            return { connected: false, hint: ML_NO_INPUT_MESSAGE };
        }
        const filters = upstream.filter((n) => n.type === 'filter-node');
        if (filters.length === 0) {
            return { connected: false, hint: ML_NEEDS_FILTER_MESSAGE };
        }
        if (filters.some((f) => reachesSource(f.id, nodes, edges))) {
            return { connected: true, hint: null };
        }
        return { connected: false, hint: ML_FILTER_UNCONNECTED_MESSAGE };
    }

    if (reachesSource(nodeId, nodes, edges)) {
        return { connected: true, hint: null };
    }
    return { connected: false, hint: NOT_CONNECTED_MESSAGE };
}

/** Ids of nodes that sit on a cycle (empty when the graph is acyclic). */
const findCycleNodeIds = (nodes: Node[], edges: Edge[]): string[] => {
    const ids = new Set(nodes.map((n) => n.id));
    const live = edges.filter((e) => ids.has(e.source) && ids.has(e.target));
    const remaining = new Set(ids);
    // Peel off nodes with no incoming edge, then nodes with no outgoing edge;
    // whatever is left is on (or between) cycles.
    let changed = true;
    while (changed) {
        changed = false;
        for (const id of [...remaining]) {
            const hasIn = live.some(
                (e) => e.target === id && remaining.has(e.source)
            );
            const hasOut = live.some(
                (e) => e.source === id && remaining.has(e.target)
            );
            if (!hasIn || !hasOut) {
                remaining.delete(id);
                changed = true;
            }
        }
    }
    return [...remaining];
};

export const validatePipeline = (nodes: Node[], edges: Edge[]) => {
    const errors: string[] = [];
    // Always empty now: the old "Filter should come after Window" and "Outputs
    // should come after preprocessing" warnings can't happen, because the
    // connection rules force every pipeline to start Source -> Window. The
    // field stays so callers don't need to change.
    const warnings: string[] = [];
    // Node id -> the sentence to show on that node (first problem wins).
    const nodeIssues: Record<string, string> = {};
    const addError = (message: string, nodeIds: string[] = []) => {
        if (!errors.includes(message)) errors.push(message);
        nodeIds.forEach((id) => {
            if (!(id in nodeIssues)) nodeIssues[id] = message;
        });
    };

    nodes.forEach((node) => {
        if (!isNodeTypeEnabled(node.type)) {
            addError(
                `Node "${node.id}" has an unavailable type (${node.type || 'missing type'}). Remove it before starting.`,
                [node.id]
            );
        }
    });

    const byId = new Map(nodes.map((n) => [n.id, n]));
    const incoming = new Map<string, string[]>();
    nodes.forEach((n) => incoming.set(n.id, []));
    edges.forEach((e) => {
        if (!incoming.has(e.target) || !byId.has(e.source)) return;
        incoming.get(e.target)!.push(e.source);
    });

    // Require 1 source node
    const sourceNodes = nodes.filter((n) => n.type === 'source-node');
    if (sourceNodes.length === 0)
        addError('Add a Source node before starting.');
    if (sourceNodes.length > 1)
        addError(
            'Multiple Source nodes are not allowed.',
            sourceNodes.map((n) => n.id)
        );

    // Require 1 window node
    const windowNodes = nodes.filter((n) => n.type === 'window-node');
    if (windowNodes.length === 0)
        addError('Add a Window node before starting.');
    if (windowNodes.length > 1)
        addError(
            'Multiple Window nodes are not allowed.',
            windowNodes.map((n) => n.id)
        );

    // A window with nothing connected into it
    windowNodes.forEach((win) => {
        if ((incoming.get(win.id) ?? []).length === 0) {
            addError('Connect Window directly to Source before starting.', [
                win.id,
            ]);
        }
    });

    // If ML node exists, window is required for the ML pipeline
    const mlNodes = nodes.filter((n) => n.type === 'machine-learning-node');
    if (mlNodes.length > 0 && windowNodes.length === 0) {
        addError('A Window node is required for ML pipelines.');
    }

    // Every existing connection must obey the same rules as dragging one
    edges.forEach((edge) => {
        const from = byId.get(edge.source);
        const to = byId.get(edge.target);
        if (!from || !to) return;
        const check = checkConnection(
            from.type,
            to.type,
            edges.some((e) => e !== edge && e.source === edge.source)
        );
        if (!check.allowed) {
            addError(check.message, [
                check.blame === 'source' ? from.id : to.id,
            ]);
        }
    });

    // Cycles
    const cycleIds = findCycleNodeIds(nodes, edges);
    if (cycleIds.length > 0) {
        addError(
            'Pipeline contains a cycle. Remove a connection to break it.',
            [...cycleIds]
        );
    }

    return { errors, warnings, nodeIssues };
};

// ids of nodes with a path back to a source node
const connectedToSource = (nodes: Node[], edges: Edge[]) => {
    const reached = new Set(
        nodes.filter((n) => n.type === 'source-node').map((n) => n.id)
    );
    const queue = [...reached];
    while (queue.length > 0) {
        const id = queue.shift()!;
        for (const e of edges) {
            if (e.source === id && !reached.has(e.target)) {
                reached.add(e.target);
                queue.push(e.target);
            }
        }
    }
    return reached;
};

// Converts React Flow state to backend pipeline format (nodes + edges).
// Unconnected nodes are left out; the canvas already flags them.
export const buildPipelinePayload = (
    nodes: Node[],
    edges: Edge[],
    sessionId: string
): PipelinePayload => {
    const connected = connectedToSource(nodes, edges);
    const sent = topoSort(nodes, edges).filter(
        (n) => typeMap[n.type ?? ''] && connected.has(n.id)
    );
    const sentIds = new Set(sent.map((n) => n.id));

    return {
        session_id: sessionId,
        nodes: sent.map((n) => {
            const type = typeMap[n.type ?? ''];
            return {
                id: n.id,
                type,
                config: nodeConfig(type, (n.data ?? {}) as NodeData),
            };
        }),
        edges: edges
            .filter((e) => sentIds.has(e.source) && sentIds.has(e.target))
            .map((e) => ({ source: e.source, target: e.target })),
    };
};

/** Build a run snapshot only after the current board and session pass validation. */
export function preparePipelineStart(
    nodes: Node[],
    edges: Edge[],
    sessionId: number | null
) {
    const { errors, warnings, nodeIssues } = validatePipeline(nodes, edges);
    if (sessionId === null) {
        errors.push('Wait for a session to be ready before starting.');
    }
    return {
        errors,
        warnings,
        nodeIssues,
        payload:
            errors.length === 0 && sessionId !== null
                ? buildPipelinePayload(nodes, edges, String(sessionId))
                : null,
    };
}
