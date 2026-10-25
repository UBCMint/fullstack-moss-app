import type { Node, Edge } from '@xyflow/react';
import type { PipelinePayload } from './pipeline';

// defines backend types for React Flow types
const typeMap: Record<string, string> = {
    'filter-node': 'preprocessing',
    'window-node': 'window',
    'machine-learning-node': 'ml',
};

// allow for defaults of the filtering node to still be applied if user doesn't specify them in the UI
const DEFAULT_PROCESSING = {
    apply_bandpass: false,
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

// Only these nodes are executed by the backend pipeline
const PIPELINE_NODE_TYPES = new Set([
    'window-node',
    'filter-node',
    'machine-learning-node',
]);

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

// Converts React Flow state to backend pipeline format
export const buildPipelinePayload = (
    nodes: Node[],
    edges: Edge[],
    sessionId: string
): PipelinePayload => {
    const orderedNodes = topoSort(nodes, edges); // Ensure nodes are in execution order

    return {
        session_id: sessionId,
        nodes: orderedNodes
            .filter((n) => PIPELINE_NODE_TYPES.has(n.type ?? ''))
            .map((n) => {
                const type = typeMap[n.type ?? ''] ?? n.type ?? 'unknown'; // Map to backend type
                const config =
                    (n.data as { config?: Record<string, unknown> })?.config ??
                    {};

                if (type == 'preprocessing') {
                    return {
                        type,
                        config: { ...DEFAULT_PROCESSING, ...config },
                    }; //apply defaults if not specified by user
                }

                if (type == 'window') {
                    return {
                        type,
                        config: { ...DEFAULT_WINDOWING, ...config },
                    };
                }

                return { type, config };
            }),
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
