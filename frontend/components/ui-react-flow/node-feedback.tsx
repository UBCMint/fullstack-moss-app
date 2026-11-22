'use client';
import React from 'react';
import type { NodeProps } from '@xyflow/react';
import { AlertCircle, X } from 'lucide-react';
import { useGlobalContext } from '@/context/GlobalContext';
import { useNodeConnection } from '@/components/nodes/use-node-connection';

/**
 * Start-time problems, keyed by node id (see `validatePipeline`). The editor
 * provides this; nodes with an entry get a red outline and the sentence
 * explaining what to fix. It is cleared as soon as the board changes.
 */
export const NodeIssuesContext = React.createContext<Record<string, string>>(
    {}
);

// Nodes whose cards stay grey until they have a path back to the Source node.
// (The ML node explains this inside its own card instead.)
const HINTED_NODE_TYPES = new Set([
    'filter-node',
    'resampling-node',
    'signal-graph-node',
    'label-node',
]);

function NodeFeedback({
    id,
    type,
    children,
}: {
    id: string;
    type: string;
    children: React.ReactNode;
}) {
    const issues = React.useContext(NodeIssuesContext);
    const { dataStreaming } = useGlobalContext();
    const { connected, hint } = useNodeConnection(
        HINTED_NODE_TYPES.has(type) ? id : undefined
    );
    const [dismissedHint, setDismissedHint] = React.useState<string | null>(
        null
    );

    const issue = issues[id];
    // A Start-time problem is more specific, so it replaces the grey-node hint.
    const showHint =
        !issue &&
        HINTED_NODE_TYPES.has(type) &&
        !dataStreaming &&
        !connected &&
        hint !== null &&
        dismissedHint !== hint;

    // Show the hint again if the node gets connected and later disconnected.
    React.useEffect(() => {
        if (connected) setDismissedHint(null);
    }, [connected]);

    return (
        <>
            {children}
            {issue && (
                <>
                    <div
                        aria-hidden
                        className="pointer-events-none absolute -inset-1 rounded-[34px] border-[3px] border-red-500"
                    />
                    <div
                        role="alert"
                        className="nodrag nopan absolute left-2 right-2 top-full mt-3 flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-[14px] leading-5 text-red-800"
                    >
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                        <span>{issue}</span>
                    </div>
                </>
            )}
            {showHint && (
                <div
                    role="status"
                    className="nodrag nopan absolute left-2 right-2 top-full mt-3 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-[14px] leading-5 text-amber-900"
                >
                    <span className="flex-1">{hint}</span>
                    <button
                        type="button"
                        aria-label="Dismiss hint"
                        onClick={() => setDismissedHint(hint)}
                        className="mt-0.5 shrink-0 text-amber-700 hover:text-amber-900"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
            )}
        </>
    );
}

/** Wrap a node component so it shows its connection hint and Start-time issue. */
export function withNodeFeedback(Component: React.ComponentType<never>) {
    // React Flow always renders node components with NodeProps; each node
    // declares only the subset of those props it uses.
    const Inner = Component as unknown as React.ComponentType<NodeProps>;
    const Wrapped = (props: NodeProps) => (
        <NodeFeedback id={props.id} type={props.type}>
            <Inner {...props} />
        </NodeFeedback>
    );
    Wrapped.displayName = `withNodeFeedback(${Component.displayName ?? Component.name ?? 'Node'})`;
    return Wrapped;
}
