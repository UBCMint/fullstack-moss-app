import * as React from 'react';
import { ArrowLeft, BarChart2, LayoutList, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LabelColor, colorClassMap } from './label-combo-box';
import {
    CartesianGrid,
    Line,
    LineChart,
    ReferenceArea,
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
    fetchDataForLabel?: (start: string, end: string) => Promise<LabelGraphPoint[]>;
}

interface PackedTimelineEntry {
    row: TimelineLabelRow;
    startMs: number;
    endMs: number;
    laneIndex: number;
}

interface FocusWindowMs {
    startMs: number;
    endMs: number;
}

const colorFillTextMap: Record<LabelColor, string> = {
    'teal-700': 'text-white',
    'teal-500': 'text-white',
    'teal-300': 'text-white',
    'mint-100': 'text-[#2E7B75]',
};

const colorHexMap: Record<LabelColor, string> = {
    'teal-700': '#2E7B75',
    'teal-500': '#6CAFA4',
    'teal-300': '#98CDBF',
    'mint-100': '#D6E6D4',
};

const VISIBLE_WINDOW_MS = 30_000;
const TICK_INTERVAL_MS = 5_000;
const LIVE_EDGE_EPSILON_PX = 4;

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
    fetchDataForLabel,
}: LabelTimelinePanelProps) {
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
        return Math.max(maxValue, axisStartMs + VISIBLE_WINDOW_MS);
    }, [axisStartMs, rows, latestBackendTimestamp, latestMs]);

    const elapsedDurationMs = Math.max(axisEndMs - axisStartMs, 1);
    const virtualDurationMs = Math.max(elapsedDurationMs, VISIBLE_WINDOW_MS);
    const virtualTrackWidthPercent = (virtualDurationMs / VISIBLE_WINDOW_MS) * 100;

    const ticks = React.useMemo(() => {
        const tickCount = Math.floor(virtualDurationMs / TICK_INTERVAL_MS) + 1;
        return Array.from({ length: tickCount }, (_, index) => {
            const offsetMs = index * TICK_INTERVAL_MS;
            const absoluteMs = axisStartMs + offsetMs;
            return {
                ratio: offsetMs / virtualDurationMs,
                label: formatAbsoluteTime(absoluteMs),
            };
        }).filter((tick) => tick.ratio >= 0 && tick.ratio <= 1.0001);
    }, [axisStartMs, virtualDurationMs]);

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
    const [selectedGraphEventId, setSelectedGraphEventId] = React.useState<
        string | null
    >(null);
    const [focusWindowMs, setFocusWindowMs] =
        React.useState<FocusWindowMs | null>(null);
    const [selectedEventMs, setSelectedEventMs] = React.useState<FocusWindowMs | null>(null);
    const [fetchedFocusData, setFetchedFocusData] = React.useState<LabelGraphPoint[] | null>(null);
    const [isFetchingData, setIsFetchingData] = React.useState(false);

    const signalConfigs: Array<{
        key: 'signal1' | 'signal2' | 'signal3' | 'signal4';
        label: string;
        color: string;
    }> = [
        { key: 'signal1', label: 'Channel 1', color: '#0000ff' },
        { key: 'signal2', label: 'Channel 2', color: '#00ff00' },
        { key: 'signal3', label: 'Channel 3',  color: '#FF00D0' },
        { key: 'signal4', label: 'Channel 4',  color: '#FF0000' },
    ];

    const toggleSignal = (
        signalKey: 'signal1' | 'signal2' | 'signal3' | 'signal4'
    ) => {
        setHighlightedSignal(signalKey);
    };

    // beginning of new, not sure if this works
    const normalizedGraphData = React.useMemo(() => {
        return graphData
            .map((point) => {
                const timeMs = parseTimestampMs(point.time);
                if (timeMs === null) {
                    return null;
                }
                return { ...point, timeMs };
            })
            .filter(
                (
                    point
                ): point is LabelGraphPoint & {
                    timeMs: number;
                } => point !== null
            );
    }, [graphData]);

    const displayedGraphData = React.useMemo<LabelGraphPoint[]>(() => {
        if (fetchedFocusData) {
            return fetchedFocusData;
        }

        if (!focusWindowMs) {
            return graphData;
        }

        const focused = normalizedGraphData.filter(
            (point) =>
                point.timeMs >= focusWindowMs.startMs &&
                point.timeMs <= focusWindowMs.endMs
        );

        if (focused.length === 0) {
            return graphData;
        }

        return focused.map(({ timeMs: _timeMs, ...point }) => point);
    }, [fetchedFocusData, focusWindowMs, graphData, normalizedGraphData]);

    // Chart data with a numeric timeMs field so XAxis can use type="number"
    // and ReferenceArea can use reliable numeric x1/x2.
    const chartData = React.useMemo(() =>
        displayedGraphData.map((p) => ({
            ...p,
            timeMs: parseTimestampMs(p.time) ?? 0,
        })),
    [displayedGraphData]);

    const handleGraphEventClick = React.useCallback(
        (row: TimelineLabelRow) => {
            const startMs = parseTimestampMs(row.startTimestamp);
            const endMs = parseTimestampMs(row.endTimestamp ?? latestBackendTimestamp);

            if (startMs === null || endMs === null) {
                return;
            }

            const durationMs = Math.max(endMs - startMs, 1_000);
            const paddingMs = Math.max(Math.floor(durationMs * 0.1), 500);

            setSelectedGraphEventId(row.id);
            setSelectedEventMs({ startMs, endMs });
            setFocusWindowMs({
                startMs: startMs - paddingMs,
                endMs: endMs + paddingMs,
            });

            if (fetchDataForLabel && row.endTimestamp) {
                setIsFetchingData(true);
                fetchDataForLabel(row.startTimestamp, row.endTimestamp)
                    .then((data) => setFetchedFocusData(data.length > 0 ? data : null))
                    .catch(() => setFetchedFocusData(null))
                    .finally(() => setIsFetchingData(false));
            }
        },
        [latestBackendTimestamp, fetchDataForLabel]
    );

    const handleReturnToLive = React.useCallback(() => {
        setSelectedGraphEventId(null);
        setFocusWindowMs(null);
        setSelectedEventMs(null);
        setFetchedFocusData(null);
        setIsFetchingData(false);
    }, []);

    const referenceAreaMs = React.useMemo((): { x1: number; x2: number } | null => {
        if (!selectedGraphEventId || !selectedEventMs) return null;

        // When fetched data is available use its actual time range.
        if (fetchedFocusData && fetchedFocusData.length >= 1) {
            const times = fetchedFocusData
                .map((p) => parseTimestampMs(p.time))
                .filter((t): t is number => t !== null);
            if (times.length >= 1) {
                return { x1: Math.min(...times), x2: Math.max(...times) };
            }
        }

        // Fall back to the event's own start/end ms.
        return { x1: selectedEventMs.startMs, x2: selectedEventMs.endMs };
    }, [selectedGraphEventId, fetchedFocusData, selectedEventMs]);
    // end of new, not sure if this works

    const timelineScrollRef = React.useRef<HTMLDivElement | null>(null);
    const isAtLiveEdgeRef = React.useRef(true);

    const handleTimelineScroll = React.useCallback(() => {
        const node = timelineScrollRef.current;
        if (!node) {
            return;
        }

        isAtLiveEdgeRef.current =
            node.scrollLeft + node.clientWidth >=
            node.scrollWidth - LIVE_EDGE_EPSILON_PX;
    }, []);

    React.useEffect(() => {
        if (viewMode !== 'timeline') {
            return;
        }

        const node = timelineScrollRef.current;
        if (!node || !isAtLiveEdgeRef.current) {
            return;
        }

        node.scrollLeft = Math.max(node.scrollWidth - node.clientWidth, 0);
    }, [axisEndMs, laneGroups.length, virtualTrackWidthPercent, viewMode]);

    if (!isExpanded) {
        return null;
    }

    return (
        <div className="rounded-b-[28px] overflow-hidden">
            {/* Header row — mirrors the collapsed node header */}
            <div className="w-full h-[70px] px-4 flex items-center justify-between relative">
                <div className="flex items-center">
                    {/* Left circle */}
                    <span
                        className={cn(
                            'absolute left-6 w-6 h-6 rounded-full flex items-center justify-center border-[3px]',
                            isConnected ? 'border-black' : 'border-[#D3D3D3]'
                        )}
                    >
                        {isConnected && <span className="w-3 h-3 rounded-full bg-white" />}
                    </span>
                    {/* Status dot */}
                    <div
                        className={cn(
                            'absolute left-16 w-3 h-3 rounded-full',
                            isConnected && isDataStreamOn
                                ? 'bg-[#509693]'
                                : 'bg-[#D3D3D3]'
                        )}
                    />
                    <h3 className="absolute left-24 font-geist text-[25px] font-[550] leading-tight text-black tracking-wider">
                        {viewMode === 'graph' ? 'Graph View' : 'Timeline'}
                    </h3>
                </div>

                <div className="flex items-center gap-2 pr-10">
                    {viewMode === 'graph' && selectedGraphEventId && (
                        <button
                            className="nodrag nopan rounded-md border border-[#D3D3D3] bg-white px-3 py-1 text-sm text-[#7A7A7A] hover:bg-[#F2F2F2] transition-colors"
                            onClick={handleReturnToLive}
                        >
                            <ArrowLeft size={14} className="inline mr-2" />Live
                        </button>
                    )}
                    {viewMode === 'timeline' && (
                        <button
                            className="nodrag nopan rounded-md border border-[#D3D3D3] bg-white px-3 py-1 text-sm text-[#7A7A7A] hover:bg-[#F2F2F2] transition-colors flex items-center gap-2"
                            onClick={onGraphViewClick}
                        >
                            <BarChart2 size={14} />
                            Graph View
                        </button>
                    )}
                    {viewMode === 'graph' && (
                        <button
                            className="nodrag nopan rounded-md border border-[#D3D3D3] bg-white px-3 py-1 text-sm text-[#7A7A7A] hover:bg-[#F2F2F2] transition-colors"
                            onClick={onTimelineViewClick}
                        >
                            <LayoutList size={14} className="inline mr-2" />Timeline View
                        </button>
                    )}
                    <button
                        className="nodrag nopan text-[#BFBFBF] hover:text-[#8F8F8F] transition-colors"
                        onClick={onClose}
                        aria-label="Close timeline panel"
                    >
                        <X size={18} />
                    </button>
                    {/* Right circle */}
                    <span
                        className={cn(
                            'absolute right-6 w-6 h-6 rounded-full flex items-center justify-center border-[3px]',
                            isConnected ? 'border-black' : 'border-[#D3D3D3]'
                        )}
                    >
                        {isConnected && <span className="w-3 h-3 rounded-full bg-white" />}
                    </span>
                </div>
            </div>

            <div
                className="mx-4 mb-4 flex flex-col gap-3 overflow-y-auto max-h-[520px]"
                onWheel={(e) => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); }}
            >

            {viewMode === 'graph' ? (
                <div className="rounded-[16px] border border-[#D3D3D3] bg-white p-3">
                    <div className="grid grid-cols-[1fr_140px] gap-4">
                        <div className="h-[320px] rounded-[12px] border border-[#E2E2E2] bg-white p-2 relative">
                            {isFetchingData && (
                                <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10 rounded-[10px]">
                                    <span className="text-sm text-[#6CAFA4] animate-pulse">Loading event data…</span>
                                </div>
                            )}
                            {!isFetchingData && selectedGraphEventId && fetchedFocusData === null && (
                                <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10 rounded-[10px]">
                                    <span className="text-sm text-[#8A8A8A]">No recorded data for this event</span>
                                </div>
                            )}
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 24, left: 16 }}>
                                    <CartesianGrid
                                        strokeDasharray="3 3"
                                        stroke="#E7E7E7"
                                    />
                                    <XAxis
                                        dataKey="timeMs"
                                        type="number"
                                        domain={['dataMin', 'dataMax']}
                                        tickFormatter={(value) => formatAbsoluteTime(value)}
                                        tick={{ fontSize: 11, fill: '#7A7A7A' }}
                                        label={{ value: 'Time (HH:MM:SS)', position: 'insideBottom', offset: -14, fontSize: 10, fill: '#666' }}
                                    />
                                    <YAxis
                                        tick={{ fontSize: 11, fill: '#7A7A7A' }}
                                        tickFormatter={(v) => Number(v).toFixed(1)}
                                        width={60}
                                        label={{ value: 'Frequency (Hz)', angle: -90, position: 'insideLeft', dy: 55, dx: 4, fontSize: 10, fill: '#666' }}
                                    />
                                    {referenceAreaMs && (
                                        <ReferenceArea
                                            x1={referenceAreaMs.x1}
                                            x2={referenceAreaMs.x2}
                                            fill="#2E7B75"
                                            fillOpacity={0.12}
                                            stroke="#2E7B75"
                                            strokeOpacity={0.3}
                                        />
                                    )}
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
                                                    ? signal.color
                                                    : '#C0C0C0'
                                            }
                                            strokeWidth={
                                                highlightedSignal === signal.key
                                                    ? 2
                                                    : 1
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
                                            onClick={() => toggleSignal(signal.key)}
                                        >
                                            <span
                                                className="h-3.5 w-3.5 rounded-sm flex items-center justify-center flex-shrink-0"
                                                style={{
                                                    backgroundColor: highlightedSignal === signal.key ? signal.color : 'transparent',
                                                    border: highlightedSignal === signal.key ? 'none' : '1.5px solid #BFBFBF',
                                                }}
                                            >
                                                {highlightedSignal === signal.key && (
                                                    <svg width="8" height="7" viewBox="0 0 8 7" fill="none">
                                                        <path d="M1 3L3 5.5L7 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                                    </svg>
                                                )}
                                            </span>
                                            {signal.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <h4 className="mb-2 text-sm font-semibold text-black">
                                    Event
                                </h4>
                                <div className="max-h-[180px] space-y-1.5 overflow-y-auto pr-1">
                                    {tableRows.length === 0 ? (
                                        <div className="text-sm text-[#8A8A8A]">
                                            No events yet.
                                        </div>
                                    ) : (
                                        tableRows.map((row) => {
                                            const isSelected =
                                                row.id === selectedGraphEventId;

                                            return (
                                                <button
                                                    key={row.id}
                                                    className={cn(
                                                        'nodrag nopan w-full rounded-md border px-3 py-1.5 text-center text-sm transition-colors',
                                                        isSelected
                                                            ? 'border-[#2E7B75] bg-[#E8F2F1] text-[#163B39]'
                                                            : 'border-[#D3D3D3] text-black hover:bg-[#F5F5F5]'
                                                    )}
                                                    onClick={() => handleGraphEventClick(row)}
                                                >
                                                    <span className="truncate">
                                                        {row.label}
                                                        {row.isInProgress ? ' •' : ''}
                                                    </span>
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
                <div className="rounded-[16px] border border-[#D3D3D3] bg-white p-3">
                    <div
                        ref={timelineScrollRef}
                        onScroll={handleTimelineScroll}
                        onWheel={(e) => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); }}
                        className="w-full overflow-x-auto rounded-md border border-[#E2E2E2] pb-2"
                    >
                        <div
                            className="min-w-full relative"
                            style={{ width: `${virtualTrackWidthPercent}%` }}
                        >
                            {/* Dotted vertical start/end lines for each label */}
                            {packedEntries.map((entry) => {
                                const startOffset = Math.max(entry.startMs - axisStartMs, 0);
                                const endOffset = Math.max(entry.endMs - axisStartMs, startOffset + 1);
                                const startPercent = (startOffset / virtualDurationMs) * 100;
                                const endPercent = (endOffset / virtualDurationMs) * 100;
                                const color = colorHexMap[entry.row.color];
                                return (
                                    <React.Fragment key={`lines-${entry.row.id}`}>
                                        <div
                                            className="absolute top-0 bottom-0 pointer-events-none"
                                            style={{
                                                left: `${startPercent}%`,
                                                borderLeft: `1.5px dashed ${color}`,
                                                zIndex: 1,
                                            }}
                                        />
                                        {!entry.row.isInProgress && (
                                            <div
                                                className="absolute top-0 bottom-0 pointer-events-none"
                                                style={{
                                                    left: `${endPercent}%`,
                                                    borderLeft: `1.5px dashed ${color}`,
                                                    zIndex: 1,
                                                }}
                                            />
                                        )}
                                    </React.Fragment>
                                );
                            })}

                            <div className="mb-3 relative h-6 border-b border-[#D3D3D3] z-10 bg-white">
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
                                        className="relative h-8 w-full"
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
                                            const leftPercent =
                                                (startOffset / virtualDurationMs) * 100;
                                            const widthPercent = Math.max(
                                                ((endOffset - startOffset) /
                                                    virtualDurationMs) *
                                                    100,
                                                2
                                            );

                                            return (
                                                <div
                                                    key={entry.row.id}
                                                    className={cn(
                                                        'absolute top-0 h-full rounded-md flex items-center px-3 text-sm font-medium',
                                                        colorClassMap[entry.row.color],
                                                        colorFillTextMap[entry.row.color],
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
                                                    {entry.row.isInProgress ? ' •' : ''}
                                                </div>
                                            );
                                        })}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {viewMode === 'timeline' && (
                <div className="rounded-[16px] border border-[#D3D3D3] bg-white p-3">
                <h3 className="mb-3 font-geist text-[20px] font-[550] leading-tight text-black">
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
        </div>
    );
}