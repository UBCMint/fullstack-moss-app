'use client';
import React from 'react';
import { useReactFlow } from '@xyflow/react';
import { getNodeConnectionStatus } from '@/lib/pipeline-validation';

/**
 * Whether a node is connected into the pipeline (the black vs. grey circles)
 * and, if not, the one sentence explaining what to do. All the rules live in
 * `getNodeConnectionStatus` (lib/pipeline-validation.ts); this hook only keeps
 * the answer fresh as the board changes.
 */
export function useNodeConnection(id: string | undefined) {
    const { getNodes, getEdges } = useReactFlow();
    const [status, setStatus] = React.useState<{
        connected: boolean;
        hint: string | null;
    }>({ connected: false, hint: null });

    const refresh = React.useCallback(() => {
        if (!id) return;
        try {
            const next = getNodeConnectionStatus(id, getNodes(), getEdges());
            // Keep the same object when nothing changed so we don't re-render every tick.
            setStatus((prev) =>
                prev.connected === next.connected && prev.hint === next.hint
                    ? prev
                    : next
            );
        } catch (error) {
            console.error('Error checking connection:', error);
            setStatus({ connected: false, hint: null });
        }
    }, [id, getNodes, getEdges]);

    React.useEffect(() => {
        // Nodes that don't need the answer pass no id and skip all polling.
        if (!id) return;
        refresh();
        window.addEventListener('reactflow-edges-changed', refresh);
        // Periodic check as a backup for changes that don't dispatch the event.
        const interval = setInterval(refresh, 1000);
        return () => {
            window.removeEventListener('reactflow-edges-changed', refresh);
            clearInterval(interval);
        };
    }, [id, refresh]);

    return status;
}
