import { Edge, Node } from '@xyflow/react';

export type FrontendWorkspaceState = {
    nodes: Node[];
    edges: Edge[];
};

function isValidNode(value: unknown): boolean {
    if (!value || typeof value !== 'object') return false;
    const n = value as { id?: unknown; type?: unknown; data?: unknown };
    return (
        typeof n.id === 'string' &&
        n.id.length > 0 &&
        typeof n.type === 'string' &&
        n.type.length > 0 &&
        n.data !== undefined &&
        n.data !== null &&
        typeof n.data === 'object'
    );
}

function isValidEdge(value: unknown): boolean {
    if (!value || typeof value !== 'object') return false;
    const e = value as { id?: unknown; source?: unknown; target?: unknown };
    return (
        typeof e.id === 'string' &&
        e.id.length > 0 &&
        typeof e.source === 'string' &&
        e.source.length > 0 &&
        typeof e.target === 'string' &&
        e.target.length > 0
    );
}

export function isFrontendWorkspaceState(
    value: unknown
): value is FrontendWorkspaceState {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const candidate = value as {
        nodes?: unknown;
        edges?: unknown;
    };

    if (!Array.isArray(candidate.nodes) || !Array.isArray(candidate.edges)) {
        return false;
    }

    return (
        candidate.nodes.every(isValidNode) && candidate.edges.every(isValidEdge)
    );
}
