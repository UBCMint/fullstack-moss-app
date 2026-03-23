import { Edge, Node } from '@xyflow/react';

export type FrontendWorkspaceState = {
    nodes: Node[];
    edges: Edge[];
};

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

    return Array.isArray(candidate.nodes) && Array.isArray(candidate.edges);
}

