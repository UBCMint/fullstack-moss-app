import { useState } from 'react';
import DataTable from '@/components/ui-data-table/data-table';
import {
    LineChart,
    Line,
    CartesianGrid,
    ResponsiveContainer,
    XAxis,
    YAxis,
    Brush,
} from 'recharts';
import { useGlobalContext } from '@/context/GlobalContext';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import {
    CHANNEL_COLORS,
    CHANNEL_INDICES,
    CHANNEL_LABELS,
    CHANNEL_TYPES,
    NUM_CHANNELS,
} from '@/lib/channels';

interface SignalGraphViewProps {
    data: {
        time: string;
        rawTime?: string;
        channels: number[];
    }[];
    onTimeframeChange?: (start: string, end: string) => void;
}

const TABLE_PREVIEW_ROWS = 50;

export default function SignalGraphView({
    data,
    onTimeframeChange,
}: SignalGraphViewProps) {
    const { dataStreaming, setDataStreaming } = useGlobalContext();
    const [selectedChannel, setSelectedChannel] = useState<number | null>(null);

    const [brushRange, setBrushRange] = useState<{
        start: number;
        end: number;
    } | null>(null);

    const maxIndex = Math.max(0, data.length - 1);
    const activeBrushStart = Math.min(brushRange?.start ?? 0, maxIndex);
    const activeBrushEnd = Math.min(brushRange?.end ?? maxIndex, maxIndex);
    const visibleCount = activeBrushEnd - activeBrushStart + 1;

    const timeStart = data.length > 0 ? data[0].time : null;
    const timeEnd = data.length > 0 ? data[data.length - 1].time : null;

    const signals = CHANNEL_INDICES.map((i) => ({
        index: i,
        colour: CHANNEL_COLORS[i],
        name: CHANNEL_LABELS[i],
        type: CHANNEL_TYPES[i],
    }));

    const handleStartStop = () => {
        setDataStreaming(!dataStreaming);
    };

    return (
        <div className="w-full h-full grid gap-4">
            {/* ---- HEAD BUTTONS ---- */}
            <div className="flex justify-end mt-[-30px] space-x-[26px]">
                <Button
                    onClick={handleStartStop}
                    className={dataStreaming ? 'bg-red-500' : 'bg-[#2E7B75]'}
                >
                    {dataStreaming ? 'Stop Data Stream' : 'Start Data Stream'}
                </Button>
            </div>

            {/* ---- TOP HALF: CHART ---- */}
            <div className="flex flex-col h-[55vh] border bg-white shadow-lg rounded-2xl p-4 overflow-hidden relative">
                {data.length === 0 && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center z-10 rounded-2xl bg-white">
                        <p className="text-gray-400 font-medium text-sm">
                            No data yet
                        </p>
                        <p className="text-gray-300 text-xs mt-1">
                            Start the data stream to see signal data
                        </p>
                    </div>
                )}
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                        data={data}
                        syncId="SignalChart"
                        margin={{ top: 10, right: 30, bottom: 10, left: 20 }}
                    >
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="time" interval="preserveStartEnd" />
                        <YAxis
                            type="number"
                            domain={['auto', 'auto']}
                            tickCount={50}
                            tickFormatter={(v) => Number(v).toFixed(1)}
                            width={70}
                            tick={{ fontSize: 15, fill: '#666' }}
                            label={{
                                value: 'Frequency (Hz)',
                                angle: -90,
                                position: 'insideLeft',
                                dy: 60,
                                dx: -10,
                            }}
                        />
                        {signals.map((s) => (
                            <Line
                                key={s.index}
                                dataKey={(row: { channels: number[] }) =>
                                    row.channels?.[s.index]
                                }
                                isAnimationActive={false}
                                dot={false}
                                type="monotone"
                                stroke={
                                    selectedChannel === null
                                        ? s.colour
                                        : selectedChannel === s.index
                                          ? s.colour
                                          : '#C0C0C0'
                                }
                                name={s.name}
                            />
                        ))}
                        <Brush
                            dataKey="time"
                            startIndex={activeBrushStart}
                            endIndex={activeBrushEnd}
                            height={24}
                            stroke="#2E7B75"
                            fill="#EAF1F0"
                            travellerWidth={8}
                            onChange={(range) => {
                                if (
                                    range.startIndex !== undefined &&
                                    range.endIndex !== undefined
                                ) {
                                    setBrushRange({
                                        start: range.startIndex,
                                        end: range.endIndex,
                                    });
                                    if (data.length > 0 && onTimeframeChange) {
                                        const startTs =
                                            data[range.startIndex].rawTime ??
                                            data[range.startIndex].time;
                                        const endTs =
                                            data[range.endIndex].rawTime ??
                                            data[range.endIndex].time;
                                        onTimeframeChange(startTs, endTs);
                                    }
                                }
                            }}
                        />
                    </LineChart>
                </ResponsiveContainer>

                {/* X axis label — pinned to left of brush */}
                <div className="absolute bottom-[38px] left-[90px] text-md text-[#666]">
                    Time (HH:MM:SS.mmm)
                </div>

                {/* Signal selector — grouped by EEG / EMG */}
                <div className="flex flex-col gap-2 mt-2">
                    {(['eeg', 'emg'] as const).map((group) => (
                        <div
                            key={group}
                            className="flex flex-wrap gap-3 justify-center items-center"
                        >
                            <span className="text-xs font-semibold text-[#0D585F] mr-1">
                                {group.toUpperCase()}
                            </span>
                            {signals
                                .filter((s) => s.type === group)
                                .map((s) => {
                                    const isSelected =
                                        selectedChannel === s.index;
                                    const anySelected =
                                        selectedChannel !== null;
                                    return (
                                        <button
                                            key={s.index}
                                            onClick={() =>
                                                setSelectedChannel(
                                                    isSelected ? null : s.index
                                                )
                                            }
                                            className="flex items-center gap-2 px-2 py-0.5 rounded transition"
                                        >
                                            <span
                                                className="w-5 h-0.5"
                                                style={{
                                                    backgroundColor: anySelected
                                                        ? isSelected
                                                            ? s.colour
                                                            : '#C0C0C0'
                                                        : s.colour,
                                                }}
                                            />
                                            <span
                                                className={
                                                    anySelected
                                                        ? isSelected
                                                            ? 'text-black text-xs'
                                                            : 'text-gray-400 text-xs'
                                                        : 'text-black text-xs'
                                                }
                                            >
                                                {s.name}
                                            </span>
                                        </button>
                                    );
                                })}
                        </div>
                    ))}
                </div>
            </div>

            {/* ---- DISPLAY INFO ---- */}
            <div className="bg-white border shadow-lg rounded-2xl px-5 py-3 text-xs text-[#0D585F] flex flex-wrap gap-x-6 gap-y-1">
                <span>
                    <span className="font-semibold">Buffered points:</span>{' '}
                    {data.length}
                </span>
                <span>
                    <span className="font-semibold">Visible window:</span>{' '}
                    {visibleCount} samples (~{(visibleCount / 256).toFixed(2)}s
                    at 256Hz) - drag the brush to scroll
                </span>
                {data.length > 0 && (
                    <span>
                        <span className="font-semibold">Full time range:</span>{' '}
                        {timeStart} to {timeEnd}
                    </span>
                )}
                <span>
                    <span className="font-semibold">Y-axis:</span> auto-scaled
                    to actual frequency (Hz)
                </span>
                <span>
                    <span className="font-semibold">Channels:</span>{' '}
                    {NUM_CHANNELS} (8 EEG + 4 EMG)
                </span>
            </div>

            {/* ---- BOTTOM HALF: TABLE ---- */}
            <div className="bg-white border shadow-lg rounded-2xl p-4 overflow-auto">
                <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-[#0D585F] font-semibold">
                        Last {TABLE_PREVIEW_ROWS} samples
                    </span>
                    <Dialog>
                        <DialogTrigger asChild>
                            <button
                                disabled={data.length === 0}
                                className="text-xs text-[#2E7B75] underline hover:opacity-70 transition disabled:opacity-30 disabled:cursor-not-allowed disabled:no-underline"
                            >
                                Expand full table
                            </button>
                        </DialogTrigger>
                        <DialogContent className="w-[90vw] max-w-none h-[85vh] flex flex-col">
                            <DialogHeader>
                                <DialogTitle className="text-[#0D585F]">
                                    All data: {data.length} points
                                </DialogTitle>
                            </DialogHeader>
                            <div className="flex-1 overflow-auto">
                                <DataTable data={data} rowCount={data.length} />
                            </div>
                        </DialogContent>
                    </Dialog>
                </div>
                {data.length === 0 ? (
                    <p className="text-gray-300 text-sm text-center py-6">
                        No samples yet
                    </p>
                ) : (
                    <DataTable data={data} rowCount={TABLE_PREVIEW_ROWS} />
                )}
            </div>
        </div>
    );
}
