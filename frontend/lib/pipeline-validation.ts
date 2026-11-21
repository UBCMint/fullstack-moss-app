import type { Node, Edge } from '@xyflow/react';
import type { PipelinePayload } from './pipeline';

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

export const validatePipeline = (nodes: Node[], edges: Edge[]) => {
    const errors: string[] = [];
    const warnings: string[] = [];

    // maps to track nodes and their connections
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const incoming = new Map<string, string[]>();
    const outgoing = new Map<string, string[]>();

    nodes.forEach((n) => {
        incoming.set(n.id, []);
        outgoing.set(n.id, []);
    });

    // Build connection maps
    edges.forEach((e) => {
        if (!incoming.has(e.target) || !outgoing.has(e.source)) return;
        incoming.get(e.target)!.push(e.source);
        outgoing.get(e.source)!.push(e.target);
    });

    // Require 1 source node
    const sourceNodes = nodes.filter((n) => n.type === 'source-node');
    if (sourceNodes.length === 0)
        errors.push('Add a Source node before starting.');
    if (sourceNodes.length > 1)
        errors.push('Multiple Source nodes are not allowed.');

    // Require 1 window node
    const windowNodes = nodes.filter((n) => n.type === 'window-node');
    if (windowNodes.length === 0)
        errors.push('Add a Window node before starting.');
    if (windowNodes.length > 1)
        errors.push('Multiple Window nodes are not allowed.');

    // Require window node must connect directly to source
    windowNodes.forEach((win) => {
        const ins = incoming.get(win.id) ?? [];
        if (
            ins.length === 0 ||
            ins.some((id) => byId.get(id)?.type !== 'source-node')
        ) {
            errors.push('Connect Window directly to Source before starting.');
        }
    });

    // If ML node exists, window is required for the ML pipeline
    const mlNodes = nodes.filter((n) => n.type === 'machine-learning-node');
    if (mlNodes.length > 0 && windowNodes.length === 0) {
        errors.push('A Window node is required for ML pipelines.');
    }

    // Require that output nodes are terminal
    const outputTypes = new Set(['signal-graph-node', 'machine-learning-node']);
    nodes.forEach((n) => {
        if (outputTypes.has(n.type ?? '')) {
            const outs = outgoing.get(n.id) ?? [];
            if (outs.length > 0) errors.push('Output nodes must be terminal.');
        }
    });

    // Require that ML node doesnt connect directly to source
    nodes
        .filter((n) => n.type === 'machine-learning-node')
        .forEach((ml) => {
            const ins = incoming.get(ml.id) ?? [];
            if (ins.some((id) => byId.get(id)?.type === 'source-node')) {
                errors.push('ML nodes cannot connect directly to Source.');
            }
        });

    // Warn if filter node appears before window when window exists
    const filterNodes = nodes.filter((n) => n.type === 'filter-node');
    const filterDirectFromSource = filterNodes.some((fn) => {
        const ins = incoming.get(fn.id) ?? [];
        return ins.some((id) => byId.get(id)?.type === 'source-node');
    });
    if (windowNodes.length > 0 && filterDirectFromSource) {
        warnings.push(
            'Filter nodes should come after Window nodes when Window nodes are present.'
        );
    }

    // Warn if output nodes are connected directly to Source while preprocessing exists
    const hasPreprocessing = filterNodes.length > 0 || windowNodes.length > 0;
    const outputDirectFromSource = nodes.some((n) => {
        if (!outputTypes.has(n.type ?? '')) return false;
        const ins = incoming.get(n.id) ?? [];
        return ins.some((id) => byId.get(id)?.type === 'source-node');
    });
    if (hasPreprocessing && outputDirectFromSource) {
        warnings.push(
            'Outputs should come after preprocessing when preprocessing exists.'
        );
    }

    // Cycle detection: if topoSort doesn't include all nodes
    const ordered = topoSort(nodes, edges);
    if (ordered.length !== nodes.length) {
        errors.push('Pipeline contains a cycle.');
    }

    return { errors, warnings };
};

// Converts React Flow state to backend pipeline format (nodes + edges)
export const buildPipelinePayload = (
    nodes: Node[],
    edges: Edge[],
    sessionId: string
): PipelinePayload => {
    const sent = topoSort(nodes, edges).filter((n) => typeMap[n.type ?? '']);
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
    const { errors, warnings } = validatePipeline(nodes, edges);
    if (sessionId === null) {
        errors.push('Wait for a session to be ready before starting.');
    }
    return {
        errors,
        warnings,
        payload:
            errors.length === 0 && sessionId !== null
                ? buildPipelinePayload(nodes, edges, String(sessionId))
                : null,
    };
}

export const WINDOW_AFTER_SOURCE_MESSAGE =
    'The window node has to come straight after the source.';

// Only the source node may feed the window node's input. Anything may follow the window.
export function isWindowInputAllowed(
    sourceType: string | undefined,
    targetType: string | undefined
) {
    return targetType !== 'window-node' || sourceType === 'source-node';
}
