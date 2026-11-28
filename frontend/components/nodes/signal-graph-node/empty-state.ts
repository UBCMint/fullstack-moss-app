export function getSignalGraphEmptyStateMessage(
    hasData: boolean,
    dataStreaming: boolean
): string | null {
    if (hasData) return null;

    return dataStreaming
        ? 'Waiting for signal data…'
        : 'Start data stream to visualize signals.';
}
