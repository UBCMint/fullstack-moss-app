// Public build-time flag. Restart/rebuild the frontend after changing it.
export const ARTIFACT_NODE_ENABLED =
    process.env.NEXT_PUBLIC_ENABLE_ARTIFACT_NODE === 'true';

// Editor node availability is separate from backend processing node types.
const enabledNodeTypes = new Set([
    'source-node',
    'window-node',
    'filter-node',
    'resampling-node',
    'eeg-quality-node',
    'emg-quality-node',
    'machine-learning-node',
    'signal-graph-node',
    'label-node',
    ...(ARTIFACT_NODE_ENABLED ? ['artifact-node'] : []),
]);

export function isNodeTypeEnabled(type: string | undefined): boolean {
    return typeof type === 'string' && enabledNodeTypes.has(type);
}
