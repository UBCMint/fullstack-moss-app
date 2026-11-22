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
import ExportDialog from '@/components/ui/export-dialog';
import { Download } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import {
    GROUP_INFO,
    availableGroups,
    channelColour,
    describeLayout,
    groupsForView,
    type ChannelGroup,
    type ChannelGroupView,
    type ChannelLayout,
    type DataPoint,
} from '@/lib/channels';
import { cn } from '@/lib/utils';

interface SignalGraphViewProps {
    data: DataPoint[];
    layout: ChannelLayout;
    /** Which group(s) to show; owned by the Chart View node so it persists. */
    view: ChannelGroupView;
    onViewChange: (view: ChannelGroupView) => void;
    onTimeframeChange?: (start: string, end: string) => void;
}

const TABLE_PREVIEW_ROWS = 50;

const VIEW_OPTIONS: { value: ChannelGroupView; label: string }[] = [
    { value: 'eeg', label: 'EEG' },
    { value: 'emg', label: 'EMG' },
    { value: 'both', label: 'Both' },
];

const channelKey = (group: ChannelGroup, index: number) => `${group}-${index}`;

export default function SignalGraphView({
    data,
    layout,
    view,
    onViewChange,
    onTimeframeChange,
}: SignalGraphViewProps) {
    const { dataStreaming, setDataStreaming, activeSessionId } =
        useGlobalContext();
    const [isExportOpen, setIsExportOpen] = useState(false);
    // Keys of channels the user has hidden; everything else is drawn
    const [hidden, setHidden] = useState<Set<string>>(new Set());

    const [brushRange, setBrushRange] = useState<{
        start: number;
        end: number;
    } | null>(null);

    const maxIndex = Math.max(0, data.length - 1);
    const activeBrushStart = Math.min(brushRange?.start ?? 0, maxIndex);
    const activeBrushEnd = Math.min(brushRange?.end ?? maxIndex, maxIndex);
    const visibleData = data.slice(activeBrushStart, activeBrushEnd + 1);
    const visibleCount = visibleData.length;

    const timeStart = data.length > 0 ? data[0].time : null;
    const timeEnd = data.length > 0 ? data[data.length - 1].time : null;

    const groups = groupsForView(view, layout);
    const hasBothGroups = availableGroups(layout).length > 1;

    const toggleChannel = (key: string) =>
        setHidden((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });

    const setGroupVisible = (group: ChannelGroup, visible: boolean) =>
        setHidden((prev) => {
            const next = new Set(prev);
            layout[group].forEach((_, i) => {
                if (visible) next.delete(channelKey(group, i));
                else next.add(channelKey(group, i));
            });
            return next;
        });

    const handleStartStop = () => {
        if (dataStreaming) {
            setDataStreaming(false);
        } else {
            window.dispatchEvent(new Event('pipeline-start'));
        }
    };

    return (
        <div className="w-full h-full grid gap-4">
            {/* ---- HEAD BUTTONS ---- */}
            <div className="flex justify-end mt-[-30px] space-x-[26px]">
                {hasBothGroups && (
                    <div
                        role="tablist"
                        aria-label="Signal group"
                        className="mr-auto flex rounded-lg border border-[#2E7B75] overflow-hidden"
                    >
                        {VIEW_OPTIONS.map((option) => (
                            <button
                                key={option.value}
                                role="tab"
                                aria-selected={view === option.value}
                                onClick={() => onViewChange(option.value)}
                                className={cn(
                                    'px-4 py-2 text-sm font-medium transition-colors',
                                    view === option.value
                                        ? 'bg-[#2E7B75] text-white'
                                        : 'bg-white text-[#2E7B75] hover:bg-[#EAF1F0]'
                                )}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                )}
                <Button
                    variant="outline"
                    onClick={() => setIsExportOpen(true)}
                    className="border-[#2E7B75] text-[#2E7B75] gap-2"
                >
                    Export
                    <Download size={16} />
                </Button>
                <Button
                    onClick={handleStartStop}
                    className={dataStreaming ? 'bg-red-500' : 'bg-[#2E7B75]'}
                >
                    {dataStreaming ? 'Stop Data Stream' : 'Start Data Stream'}
                </Button>
            </div>
            <ExportDialog
                open={isExportOpen}
                sessionId={activeSessionId}
                onOpenChange={setIsExportOpen}
            />

            {/* ---- TOP HALF: ONE PANEL PER GROUP + SHARED TIME NAVIGATOR ---- */}
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

                <div className="flex-1 min-h-0 flex flex-col gap-2">
                    {groups.map((group) => (
                        <GroupPanel
                            key={group}
                            group={group}
                            labels={layout[group]}
                            data={visibleData}
                            hidden={hidden}
                            onToggleChannel={toggleChannel}
                            onSetAllVisible={(visible) =>
                                setGroupVisible(group, visible)
                            }
                        />
                    ))}
                </div>

                {/* Time navigator: drag to pick the window every panel shows */}
                <div className="h-[40px] shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                            data={data}
                            margin={{ top: 0, right: 30, bottom: 0, left: 90 }}
                        >
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
                                        range.startIndex === undefined ||
                                        range.endIndex === undefined
                                    ) {
                                        return;
                                    }
                                    setBrushRange({
                                        start: range.startIndex,
                                        end: range.endIndex,
                                    });
                                    if (data.length > 0 && onTimeframeChange) {
                                        const startPoint =
                                            data[range.startIndex];
                                        const endPoint = data[range.endIndex];
                                        onTimeframeChange(
                                            startPoint.rawTime ??
                                                startPoint.time,
                                            endPoint.rawTime ?? endPoint.time
                                        );
                                    }
                                }}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
                <div className="text-xs text-[#666] pl-[90px]">
                    Time (HH:MM:SS.mmm)
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
                        <span className="font-semibold">
                            Buffered time range:
                        </span>{' '}
                        {timeStart} to {timeEnd}
                    </span>
                )}
                <span>
                    <span className="font-semibold">Y-axis:</span> auto-scaled
                    per signal group
                </span>
                <span>
                    <span className="font-semibold">Channels:</span>{' '}
                    {describeLayout(layout) || 'waiting for device'}
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
                                <DataTable
                                    data={data}
                                    rowCount={data.length}
                                    layout={layout}
                                    groups={groups}
                                />
                            </div>
                        </DialogContent>
                    </Dialog>
                </div>
                {data.length === 0 ? (
                    <p className="text-gray-300 text-sm text-center py-6">
                        No samples yet
                    </p>
                ) : (
                    <DataTable
                        data={data}
                        rowCount={TABLE_PREVIEW_ROWS}
                        layout={layout}
                        groups={groups}
                    />
                )}
            </div>
        </div>
    );
}

interface GroupPanelProps {
    group: ChannelGroup;
    labels: string[];
    data: DataPoint[];
    hidden: Set<string>;
    onToggleChannel: (key: string) => void;
    onSetAllVisible: (visible: boolean) => void;
}

// One signal group on its own Y axis (EEG and EMG differ a lot in amplitude),
// with a legend that doubles as the show/hide control for each channel.
function GroupPanel({
    group,
    labels,
    data,
    hidden,
    onToggleChannel,
    onSetAllVisible,
}: GroupPanelProps) {
    const { name, unit } = GROUP_INFO[group];
    const channels = labels.map((label, index) => ({
        index,
        label,
        key: channelKey(group, index),
        colour: channelColour(group, index),
    }));
    const shownCount = channels.filter((ch) => !hidden.has(ch.key)).length;

    return (
        <section
            aria-label={`${name} channels`}
            className="flex-1 min-h-0 flex flex-col"
        >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-[90px] pr-4 text-sm">
                <span className="font-semibold text-[#0D585F]">
                    {name}{' '}
                    <span className="font-normal text-gray-500">({unit})</span>
                </span>
                {channels.map((ch) => {
                    const isHidden = hidden.has(ch.key);
                    return (
                        <button
                            key={ch.key}
                            type="button"
                            aria-pressed={!isHidden}
                            title={isHidden ? 'Show channel' : 'Hide channel'}
                            onClick={() => onToggleChannel(ch.key)}
                            className="flex items-center gap-1.5 px-1.5 py-0.5 rounded hover:bg-gray-50 transition"
                        >
                            <span
                                className="w-5 h-0.5"
                                style={{
                                    backgroundColor: isHidden
                                        ? '#C0C0C0'
                                        : ch.colour,
                                }}
                            />
                            <span
                                className={
                                    isHidden
                                        ? 'text-gray-400 line-through'
                                        : 'text-black'
                                }
                            >
                                {ch.label}
                            </span>
                        </button>
                    );
                })}
                <span className="ml-auto flex gap-2 text-xs">
                    <button
                        type="button"
                        onClick={() => onSetAllVisible(true)}
                        disabled={shownCount === channels.length}
                        className="text-[#2E7B75] underline disabled:opacity-30 disabled:no-underline"
                    >
                        Show all
                    </button>
                    <button
                        type="button"
                        onClick={() => onSetAllVisible(false)}
                        disabled={shownCount === 0}
                        className="text-[#2E7B75] underline disabled:opacity-30 disabled:no-underline"
                    >
                        Hide all
                    </button>
                </span>
            </div>
            <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                        data={data}
                        margin={{ top: 6, right: 30, bottom: 0, left: 20 }}
                    >
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis
                            dataKey="time"
                            interval="preserveStartEnd"
                            tick={{ fontSize: 12, fill: '#666' }}
                        />
                        <YAxis
                            type="number"
                            domain={['auto', 'auto']}
                            tickCount={6}
                            tickFormatter={(v) => Number(v).toFixed(1)}
                            width={70}
                            tick={{ fontSize: 12, fill: '#666' }}
                            label={{
                                value: `${name} (${unit})`,
                                angle: -90,
                                position: 'insideLeft',
                                dx: -10,
                                style: { textAnchor: 'middle', fill: '#666' },
                            }}
                        />
                        {channels
                            .filter((ch) => !hidden.has(ch.key))
                            .map((ch) => (
                                <Line
                                    key={ch.key}
                                    dataKey={(d: DataPoint) =>
                                        d[group][ch.index]
                                    }
                                    name={ch.label}
                                    stroke={ch.colour}
                                    isAnimationActive={false}
                                    dot={false}
                                    type="monotone"
                                />
                            ))}
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </section>
    );
}
