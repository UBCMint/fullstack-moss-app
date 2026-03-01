import * as React from 'react';
import { cn } from '@/lib/utils';

type LabelColor = 'teal-700' | 'teal-500' | 'teal-300' | 'mint-100';

export type TimelineRowSource = 'Trigger' | 'Manual' | 'Auto';

export interface TimelineLabelRow {
    id: string;
    label: string;
    color: LabelColor;
    startTimestamp: string;
    endTimestamp: string | null;
    source: TimelineRowSource;
    isInProgress: boolean;
}

export interface LabelTimelinePanelProps {
    isExpanded: boolean;
    rows: TimelineLabelRow[];
    sessionStartTimestamp: string | null;
    latestBackendTimestamp: string | null;
    onClose: () => void;
    onGraphViewClick?: () => void;
}

const colorClassMap: Record<LabelColor, string> = {
    'teal-700': 'bg-[#2E7B75]',
    'teal-500': 'bg-[#6CAFA4]',
    'teal-300': 'bg-[#98CDBF]',
    'mint-100': 'bg-[#D6E6D4]',
};

const colorBorderMap: Record<LabelColor, string> = {
    'teal-700': 'border-[#2E7B75]',
    'teal-500': 'border-[#6CAFA4]',
    'teal-300': 'border-[#98CDBF]',
    'mint-100': 'border-[#D6E6D4]',
};

const parseTimestampMs = (timestamp: string | null): number | null => {
    if (!timestamp) return null;
    const value = Date.parse(timestamp);
    return Number.isNaN(value) ? null : value;
};

const formatRelativeTime = (ms: number): string => {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds
        .toString()
        .padStart(2, '0')}`;
};

const formatDuration = (ms: number | null): string => {
    if (ms == null || ms < 0) return '-';
    if (ms < 1000) return '<1s';
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
    const minutes = Math.floor(ms / 60_000);
    const seconds = Math.round((ms % 60_000) / 1000);
    return `${minutes}m ${seconds}s`;
};

export default function LabelTimelinePanel({
    isExpanded,
    rows,
    sessionStartTimestamp,
    latestBackendTimestamp,
    onClose,
    onGraphViewClick,
}: LabelTimelinePanelProps) {
    if (!isExpanded) {
        return null;
    }

    const sessionStartMs = parseTimestampMs(sessionStartTimestamp);
    const latestMs = parseTimestampMs(latestBackendTimestamp);

    const axisEndMs = React.useMemo(() => {
        const endCandidates = rows
            .map((row) => parseTimestampMs(row.endTimestamp ?? latestBackendTimestamp))
            .filter((value): value is number => value !== null);
        if (latestMs !== null) endCandidates.push(latestMs);
        if (sessionStartMs === null || endCandidates.length === 0) {
            return sessionStartMs !== null ? sessionStartMs + 60_000 : null;
        }
        const maxValue = Math.max(...endCandidates);
        return Math.max(maxValue, sessionStartMs + 30_000);
    }, [rows, latestBackendTimestamp, latestMs, sessionStartMs]);

    const domainMs =
        axisEndMs !== null && sessionStartMs !== null
            ? Math.max(axisEndMs - sessionStartMs, 1)
            : null;

    const ticks = React.useMemo(() => {
        if (sessionStartMs === null || domainMs === null) return [];
        const tickCount = 6;
        return Array.from({ length: tickCount }, (_, index) => {
            const ratio = index / (tickCount - 1);
            return {
                ratio,
                label: formatRelativeTime(Math.floor(domainMs * ratio)),
            };
        });
    }, [domainMs, sessionStartMs]);

    const tableRows = [...rows].sort((a, b) => {
        const bStart = parseTimestampMs(b.startTimestamp) ?? 0;
        const aStart = parseTimestampMs(a.startTimestamp) ?? 0;
        return bStart - aStart;
    });

    return (
        <div className="mx-4 mb-4 rounded-[24px] border border-[#D3D3D3] bg-[#F8F9F8] p-4">
            <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="inline-block h-3 w-3 rounded-full bg-[#509693]" />
                    <h3 className="text-[38px] font-[550] leading-none text-black">
                        Timeline
                    </h3>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        className="rounded-md border border-[#D3D3D3] bg-white px-3 py-1 text-sm text-[#7A7A7A] hover:bg-[#F2F2F2] transition-colors"
                        onClick={onGraphViewClick}
                    >
                        Graph View
                    </button>
                    <button
                        className="text-[#BFBFBF] hover:text-[#8F8F8F] text-xl leading-none transition-colors"
                        onClick={onClose}
                        aria-label="Close timeline panel"
                    >
                        ×
                    </button>
                </div>
            </div>

            <div className="mb-5 rounded-[16px] border border-[#D3D3D3] bg-white p-3">
                <div className="mb-3 relative h-6 border-b border-[#D3D3D3]">
                    {ticks.map((tick) => (
                        <div
                            key={`${tick.ratio}-${tick.label}`}
                            className="absolute top-0 -translate-x-1/2 text-xs text-[#7A7A7A]"
                            style={{ left: `${tick.ratio * 100}%` }}
                        >
                            {tick.label}
                        </div>
                    ))}
                </div>

                <div className="space-y-2">
                    {rows.length === 0 && (
                        <div className="py-3 text-sm text-[#8A8A8A]">
                            No labels yet. Start/stop Trigger to add moments.
                        </div>
                    )}

                    {rows.map((row) => {
                        const startMs = parseTimestampMs(row.startTimestamp);
                        const endMs = parseTimestampMs(
                            row.endTimestamp ?? latestBackendTimestamp
                        );

                        if (
                            startMs === null ||
                            endMs === null ||
                            sessionStartMs === null ||
                            domainMs === null
                        ) {
                            return null;
                        }

                        const startOffset = Math.max(startMs - sessionStartMs, 0);
                        const endOffset = Math.max(endMs - sessionStartMs, startOffset + 1);
                        const leftPercent = (startOffset / domainMs) * 100;
                        const widthPercent = Math.max(
                            ((endOffset - startOffset) / domainMs) * 100,
                            2
                        );

                        return (
                            <div
                                key={row.id}
                                className="relative h-8 rounded-md bg-[#EEF3F2]"
                            >
                                <div
                                    className={cn(
                                        'absolute top-0 h-full rounded-md border flex items-center px-3 text-sm text-[#204C49]',
                                        colorClassMap[row.color],
                                        colorBorderMap[row.color],
                                        row.isInProgress ? 'animate-pulse' : ''
                                    )}
                                    style={{
                                        left: `${leftPercent}%`,
                                        width: `${Math.min(widthPercent, 100 - leftPercent)}%`,
                                    }}
                                >
                                    {row.label}
                                    {row.isInProgress ? ' (recording)' : ''}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="rounded-[16px] border border-[#D3D3D3] bg-white p-3">
                <h4 className="mb-3 text-[32px] font-[550] leading-none text-black">
                    Event Log
                </h4>

                <div className="max-h-[210px] overflow-y-auto rounded-md border border-[#E2E2E2]">
                    <table className="w-full text-left text-sm">
                        <thead className="sticky top-0 bg-[#F0F0F0] text-black">
                            <tr>
                                <th className="px-3 py-2 font-medium">Time</th>
                                <th className="px-3 py-2 font-medium">Label</th>
                                <th className="px-3 py-2 font-medium">Duration</th>
                                <th className="px-3 py-2 font-medium">Source</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tableRows.length === 0 && (
                                <tr>
                                    <td
                                        colSpan={4}
                                        className="px-3 py-3 text-[#8A8A8A]"
                                    >
                                        No events logged yet.
                                    </td>
                                </tr>
                            )}

                            {tableRows.map((row) => {
                                const startMs = parseTimestampMs(row.startTimestamp);
                                const endMs = parseTimestampMs(
                                    row.endTimestamp ?? latestBackendTimestamp
                                );
                                const durationMs =
                                    startMs !== null && endMs !== null
                                        ? endMs - startMs
                                        : null;
                                const relativeStart =
                                    startMs !== null && sessionStartMs !== null
                                        ? startMs - sessionStartMs
                                        : null;

                                return (
                                    <tr key={row.id} className="border-t border-[#EFEFEF]">
                                        <td className="px-3 py-2 text-[#5A5A5A]">
                                            {relativeStart !== null
                                                ? formatRelativeTime(relativeStart)
                                                : '--:--'}
                                        </td>
                                        <td className="px-3 py-2 text-black">
                                            {row.label}
                                            {row.isInProgress ? ' (recording)' : ''}
                                        </td>
                                        <td className="px-3 py-2 text-[#5A5A5A]">
                                            {formatDuration(durationMs)}
                                        </td>
                                        <td className="px-3 py-2 text-[#5A5A5A]">
                                            {row.source}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}