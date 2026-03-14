import * as React from 'react';
import { cn } from '@/lib/utils';
import { colorClassMap, LabelColor } from './label-combo-box';
import {
    CartesianGrid,
    Line,
    LineChart,
    ResponsiveContainer,
    XAxis,
    YAxis,
} from 'recharts';

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

export interface LabelGraphPoint {
    id: string;
    time: string;
    signal1: number;
    signal2: number;
    signal3: number;
    signal4: number;
}

export interface LabelTimelinePanelProps {
    isExpanded: boolean;
    rows: TimelineLabelRow[];
    sessionStartTimestamp: string | null;
    latestBackendTimestamp: string | null;
    isConnected: boolean;
    isDataStreamOn: boolean;
    onClose: () => void;
    onGraphViewClick?: () => void;
    onTimelineViewClick?: () => void;
    viewMode: 'timeline' | 'graph';
    graphData: LabelGraphPoint[];
}

interface PackedTimelineEntry {
    row: TimelineLabelRow;
    startMs: number;
    endMs: number;
    laneIndex: number;
}

const colorBorderMap: Record<LabelColor, string> = {
    'teal-700': 'border-[#2E7B75]',
    'teal-500': 'border-[#6CAFA4]',
    'teal-300': 'border-[#98CDBF]',
    'mint-100': 'border-[#D6E6D4]',
};

const parseTimestampMs = (timestamp: string | null): number | null => {
    if (!timestamp) return null;

    if (/^\d+$/.test(timestamp)) {
        const numeric = Number(timestamp);
        if (Number.isFinite(numeric)) {
            return timestamp.length <= 10 ? numeric * 1000 : numeric;
        }
    }

    const value = Date.parse(timestamp);
    if (!Number.isNaN(value)) {
        return value;
    }

    // Support truncated websocket timestamps like "HH:mm:ss" or "HH:mm:ss.SSS".
    const timeOnlyMatch = timestamp.match(
        /^(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/
    );
    if (!timeOnlyMatch) {
        return null;
    }

    const hours = Number(timeOnlyMatch[1]);
    const minutes = Number(timeOnlyMatch[2]);
    const seconds = Number(timeOnlyMatch[3]);
    const milliseconds = Number((timeOnlyMatch[4] ?? '0').padEnd(3, '0').slice(0, 3));

    const baseDate = new Date();
    baseDate.setHours(hours, minutes, seconds, milliseconds);
    return baseDate.getTime();
};

const formatAbsoluteTime = (ms: number): string => {
    const date = new Date(ms);
    return `${date.getHours().toString().padStart(2, '0')}:${date
        .getMinutes()
        .toString()
        .padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;
};

const formatAbsoluteTimeWithMs = (ms: number): string => {
    const date = new Date(ms);
    return `${date.getHours().toString().padStart(2, '0')}:${date
        .getMinutes()
        .toString()
        .padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}.${date
        .getMilliseconds()
        .toString()
        .padStart(3, '0')}`;
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
    onTimelineViewClick,
    viewMode,
    isConnected,
    isDataStreamOn,
    graphData,
}: LabelTimelinePanelProps) {
    if (!isExpanded) {
        return null;
    }

    const latestMs = parseTimestampMs(latestBackendTimestamp);
    const fallbackStartMs = parseTimestampMs(sessionStartTimestamp);

    const axisStartMs = React.useMemo(() => {
        const startCandidates = rows
            .map((row) => parseTimestampMs(row.startTimestamp))
            .filter((value): value is number => value !== null);

        if (startCandidates.length > 0) {
            return Math.min(...startCandidates);
        }

        if (fallbackStartMs !== null) {
            return fallbackStartMs;
        }

        if (latestMs !== null) {
            return latestMs - 60_000;
        }

        return Date.now() - 60_000;
    }, [fallbackStartMs, latestMs, rows]);

    const axisEndMs = React.useMemo(() => {
        const endCandidates = rows
            .map((row) => parseTimestampMs(row.endTimestamp ?? latestBackendTimestamp))
            .filter((value): value is number => value !== null);

        if (latestMs !== null) endCandidates.push(latestMs);
        if (endCandidates.length === 0) {
            return axisStartMs + 60_000;
        }

        const maxValue = Math.max(...endCandidates);
        return Math.max(maxValue, axisStartMs + 30_000);
    }, [axisStartMs, rows, latestBackendTimestamp, latestMs]);

    const domainMs = Math.max(axisEndMs - axisStartMs, 1);

    const ticks = React.useMemo(() => {
        const tickCount = 6;
        return Array.from({ length: tickCount }, (_, index) => {
            const ratio = index / (tickCount - 1);
            const absoluteMs = axisStartMs + Math.floor(domainMs * ratio);
            return {
                ratio,
                label: formatAbsoluteTime(absoluteMs),
            };
        });
    }, [axisStartMs, domainMs]);

    const tableRows = [...rows].sort((a, b) => {
        const bStart = parseTimestampMs(b.startTimestamp) ?? 0;
        const aStart = parseTimestampMs(a.startTimestamp) ?? 0;
        return bStart - aStart;
    });

    const packedEntries = React.useMemo<PackedTimelineEntry[]>(() => {
        const normalized = rows
            .map((row) => {
                const startMs = parseTimestampMs(row.startTimestamp);
                const endMs = parseTimestampMs(
                    row.endTimestamp ?? latestBackendTimestamp
                );
                if (startMs === null || endMs === null) {
                    return null;
                }
                return {
                    row,
                    startMs,
                    endMs: Math.max(endMs, startMs + 1),
                };
            })
            .filter(
                (
                    value
                ): value is {
                    row: TimelineLabelRow;
                    startMs: number;
                    endMs: number;
                } => value !== null
            )
            .sort((a, b) => {
                if (a.startMs !== b.startMs) {
                    return a.startMs - b.startMs;
                }
                return a.endMs - b.endMs;
            });

        const laneEndTimes: number[] = [];
        const packed: PackedTimelineEntry[] = [];

        normalized.forEach((entry) => {
            const reusableLaneIndex = laneEndTimes.findIndex(
                (laneEndTime) => entry.startMs >= laneEndTime
            );

            if (reusableLaneIndex === -1) {
                laneEndTimes.push(entry.endMs);
                packed.push({
                    ...entry,
                    laneIndex: laneEndTimes.length - 1,
                });
                return;
            }

            laneEndTimes[reusableLaneIndex] = entry.endMs;
            packed.push({
                ...entry,
                laneIndex: reusableLaneIndex,
            });
        });

        return packed;
    }, [latestBackendTimestamp, rows]);

    const laneGroups = React.useMemo(() => {
        const totalLanes =
            packedEntries.length > 0
                ? Math.max(...packedEntries.map((entry) => entry.laneIndex)) + 1
                : 0;
        const groups: PackedTimelineEntry[][] = Array.from(
            { length: totalLanes },
            () => []
        );

        packedEntries.forEach((entry) => {
            groups[entry.laneIndex].push(entry);
        });

        return groups;
    }, [packedEntries]);

    const [highlightedSignal, setHighlightedSignal] = React.useState<
        'signal1' | 'signal2' | 'signal3' | 'signal4'>('signal1');

    const signalConfigs: Array<{
        key: 'signal1' | 'signal2' | 'signal3' | 'signal4';
        label: string;
        color: string;
    }> = [
        { key: 'signal1', label: 'Fp1', color: '#2E7B75' },
        { key: 'signal2', label: 'Fp2', color: '#6CAFA4' },
        { key: 'signal3', label: 'Cz', color: '#98CDBF' },
        { key: 'signal4', label: 'Pz', color: '#D6E6D4' },
    ];

    const toggleSignal = (
        signalKey: 'signal1' | 'signal2' | 'signal3' | 'signal4'
    ) => {
        setHighlightedSignal(signalKey);
    };

    return (
        <div className="mx-4 mb-4 rounded-[24px] border border-[#D3D3D3] bg-[#F8F9F8] p-4">
            <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    
                    {/* Status dot */}
                    <div
                        className={cn(
                            'absolute left-16 w-3 h-3 rounded-full',
                            isConnected && isDataStreamOn
                                ? 'bg-[#509693]'
                                : 'bg-[#D3D3D3]'
                        )}
                    />
                    <h3 className="absolute left-24 font-geist text-[25px] font-[550] leading-tight text-black">
                        Timeline
                    </h3>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        className="nodrag nopan rounded-md border border-[#D3D3D3] bg-white px-3 py-1 text-sm text-[#7A7A7A] hover:bg-[#F2F2F2] transition-colors"
                        onClick={
                            viewMode === 'graph'
                                ? onTimelineViewClick
                                : onGraphViewClick
                        }
                    >
                        {viewMode === 'graph' ? 'Timeline View' : 'Graph View'}
                    </button>
                    <button
                        className="nodrag nopan text-[#BFBFBF] hover:text-[#8F8F8F] text-xl leading-none transition-colors"
                        onClick={onClose}
                        aria-label="Close timeline panel"
                    >
                        ×
                    </button>
                </div>
            </div>

            {viewMode === 'graph' ? (
                <div className="mb-5 rounded-[16px] border border-[#D3D3D3] bg-white p-3">
                    <div className="grid grid-cols-[1fr_140px] gap-4">
                        <div className="h-[320px] rounded-[12px] border border-[#E2E2E2] bg-white p-2">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={graphData}>
                                    <CartesianGrid
                                        strokeDasharray="3 3"
                                        stroke="#E7E7E7"
                                    />
                                    <XAxis
                                        dataKey="time"
                                        tickFormatter={(value) =>
                                            formatAbsoluteTime(
                                                parseTimestampMs(String(value)) ??
                                                    Date.now()
                                            )
                                        }
                                        tick={{ fontSize: 11, fill: '#7A7A7A' }}
                                    />
                                    <YAxis
                                        tick={{ fontSize: 11, fill: '#7A7A7A' }}
                                    />
                                    {[...signalConfigs.filter((s) => s.key !== highlightedSignal),
                                      ...signalConfigs.filter((s) => s.key === highlightedSignal),
                                    ].map((signal) => (
                                        <Line
                                            key={signal.key}
                                            dataKey={signal.key}
                                            type="monotone"
                                            isAnimationActive={false}
                                            dot={false}
                                            stroke={
                                                highlightedSignal === signal.key
                                                    ? '#FF0000'
                                                    : '#D3D3D3' // red
                                            }
                                            strokeWidth={
                                                highlightedSignal === signal.key
                                                    ? 2
                                                    : 1.2
                                            }
                                        />
                                    ))}
                                </LineChart>
                            </ResponsiveContainer>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <h4 className="mb-2 text-sm font-semibold text-black">
                                    Highlight
                                </h4>
                                <div className="space-y-2">
                                    {signalConfigs.map((signal) => (
                                        <button
                                            key={signal.key}
                                            className="nodrag nopan flex items-center gap-2 text-sm text-black"
                                            onClick={() =>
                                                toggleSignal(signal.key)
                                            }
                                        >
                                            <span
                                                className={cn(
                                                    'h-3 w-3 rounded-sm border',
                                                    highlightedSignal === signal.key
                                                        ? 'border-[#2E7B75] bg-[#2E7B75]'
                                                        : 'border-[#BFBFBF] bg-white'
                                                )}
                                            />
                                            {signal.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <h4 className="mb-2 text-sm font-semibold text-black">
                                    Events
                                </h4>
                                <div className="max-h-[180px] space-y-2 overflow-y-auto pr-1">
                                    {tableRows.length === 0 ? (
                                        <div className="text-sm text-[#8A8A8A]">
                                            No events yet.
                                        </div>
                                    ) : (
                                        tableRows.map((row) => {
                                            const startMs = parseTimestampMs(
                                                row.startTimestamp
                                            );
                                            const isSelected =
                                                //row.id === selectedGraphEventId;
                                                false;

                                            return (
                                                <button
                                                    key={row.id}
                                                    className={cn(
                                                        'nodrag nopan w-full rounded-md border px-2 py-1.5 text-left text-sm transition-colors',
                                                        isSelected
                                                            ? 'border-[#2E7B75] bg-[#E8F2F1] text-[#163B39]'
                                                            : 'border-[#BFD9D7] text-[#204C49] hover:bg-[#EEF3F2]'
                                                    )}
                                                    onClick={() =>
                                                        //handleGraphEventClick(row)
                                                        console.log(row)
                                                    }
                                                >
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className="truncate font-medium">
                                                            {row.label}
                                                        </span>
                                                        {row.isInProgress && (
                                                            <span className="text-xs text-[#5E8B87]">
                                                                Live
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="mt-0.5 text-xs text-[#5A5A5A]">
                                                        {startMs !== null
                                                            ? formatAbsoluteTimeWithMs(
                                                                  startMs
                                                              )
                                                            : '--:--'}
                                                    </div>
                                                </button>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
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
                    {laneGroups.length === 0 && (
                        <div className="py-3 text-sm text-[#8A8A8A]">
                            No labels yet. Start/stop Trigger to add moments.
                        </div>
                    )}

                    {laneGroups.map((laneEntries, laneIndex) => (
                        <div
                            key={`timeline-lane-${laneIndex}`}
                            className="relative h-8 rounded-md bg-[#EEF3F2]"
                        >
                            {laneEntries.map((entry) => {
                                const startOffset = Math.max(
                                    entry.startMs - axisStartMs,
                                    0
                                );
                                const endOffset = Math.max(
                                    entry.endMs - axisStartMs,
                                    startOffset + 1
                                );
                                const leftPercent = (startOffset / domainMs) * 100;
                                const widthPercent = Math.max(
                                    ((endOffset - startOffset) / domainMs) * 100,
                                    2
                                );

                                return (
                                    <div
                                        key={entry.row.id}
                                        className={cn(
                                            'absolute top-0 h-full rounded-md border flex items-center px-3 text-sm text-[#204C49]',
                                            colorClassMap[entry.row.color],
                                            colorBorderMap[entry.row.color],
                                            entry.row.isInProgress ? 'animate-pulse' : ''
                                        )}
                                        style={{
                                            left: `${leftPercent}%`,
                                            width: `${Math.min(
                                                widthPercent,
                                                100 - leftPercent
                                            )}%`,
                                        }}
                                    >
                                        {entry.row.label}
                                        {entry.row.isInProgress ? ' (recording)' : ''}
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>
                </div>
            )}

            {viewMode === 'timeline' && (
                <div className="rounded-[16px] border border-[#D3D3D3] bg-white p-3">
                <h3 className="mb-3 font-geist text-[25px] font-[550] leading-tight text-black">
                    Event Log
                </h3>

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

                                return (
                                    <tr key={row.id} className="border-t border-[#EFEFEF]">
                                        <td className="px-3 py-2 text-[#5A5A5A]">
                                            {startMs !== null
                                                ? formatAbsoluteTimeWithMs(startMs)
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
            )}
        </div>
    );
}