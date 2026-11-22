import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Handle, Position, useReactFlow } from '@xyflow/react';
import { useGlobalContext } from '@/context/GlobalContext';
import useNodeData from '@/hooks/useNodeData';
import React from 'react';
import { useNodeConnection } from '../use-node-connection';

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import SignalGraphView from './signal-graph-full';
import { exportEEGData } from '@/lib/eeg-api';
import { parseEegCsv, type ParsedEegCsv } from '@/lib/eeg-csv';
import { useWebSocketContext } from '@/context/WebSocketContext';
import {
    availableGroups,
    genericLayout,
    isChannelGroupView,
    resolveLayout,
    type ChannelGroupView,
} from '@/lib/channels';
import { cn } from '@/lib/utils';

// Temporary task 24 flag. Restoration instructions are above SignalGraphNode below.
const CHART_PREVIEW_HISTORY_ENABLED =
    process.env.NEXT_PUBLIC_ENABLE_CHART_PREVIEW_HISTORY === 'true';
const PREVIEW_HISTORY_KEY = 'mossChartPreview';

const NO_SEED_DATA: ParsedEegCsv = { layout: genericLayout(0, 0), points: [] };

const GROUP_PICKER_OPTIONS: { value: ChannelGroupView; label: string }[] = [
    { value: 'eeg', label: 'EEG' },
    { value: 'emg', label: 'EMG' },
    { value: 'both', label: 'Both' },
];

type SignalGraphNodeProps = {
    id?: string;
    selected?: boolean;
    // React Flow node data. `channelGroup` is which group(s) the Preview shows.
    data?: Record<string, unknown>;
};

/*
 * TODO(task 24): RESTORE ORIGINAL BEHAVIOR WHEN RETIRING THE FLAG
 *
 * 1. Delete this exported SignalGraphNode selector function entirely.
 * 2. Delete the entire HistorySignalGraphNode component below, including all of
 *    its state, effect, history listener, and open/close handler.
 * 3. Rename OriginalSignalGraphNode to SignalGraphNode and add `export default`.
 *    Alternatively, move its body into the exported SignalGraphNode function.
 * 4. Remove `dialogProps` from its destructured arguments and remove the optional
 *    dialogProps type. Its resulting declaration should be:
 *
 *    export default function SignalGraphNode({ id, selected }: SignalGraphNodeProps) {
 *
 * 5. In that component's JSX, replace <Dialog {...dialogProps}> with <Dialog>.
 *    This restores the original dialog's own open/close handling.
 * 6. Delete CHART_PREVIEW_HISTORY_ENABLED and PREVIEW_HISTORY_KEY above.
 * 7. Remove NEXT_PUBLIC_ENABLE_CHART_PREVIEW_HISTORY from frontend/.env and remove
 *    the temporary flag section from frontend/README.md.
 *
 * Keep SignalGraphNodeProps and the existing chart content/helpers. React Flow
 * still imports the same default component, so its registration needs no edits.
 */
export default function SignalGraphNode(props: SignalGraphNodeProps) {
    if (CHART_PREVIEW_HISTORY_ENABLED) {
        return <HistorySignalGraphNode {...props} />;
    }

    return <OriginalSignalGraphNode {...props} />;
}

// Temporary task 24 fix. Delete this component when the workaround is retired.
function HistorySignalGraphNode(props: SignalGraphNodeProps) {
    const { id } = props;
    const fallbackId = React.useId();
    const previewId = id ?? fallbackId;
    const [previewOpen, setPreviewOpen] = React.useState(false);
    const closingPreview = React.useRef(false);

    React.useEffect(() => {
        // Sync dialog visibility with the current history entry on mount and Back/Forward.
        // Navigation has finished, so allow new open/close requests again.
        const syncPreviewWithHistory = () => {
            closingPreview.current = false;
            setPreviewOpen(
                window.history.state?.[PREVIEW_HISTORY_KEY] === previewId
            );
        };

        syncPreviewWithHistory();
        window.addEventListener('popstate', syncPreviewWithHistory);
        return () =>
            window.removeEventListener('popstate', syncPreviewWithHistory);
    }, [previewId]);

    // Handle dialog interactions: opening adds a Preview entry; closing goes back
    // to the editor entry without unmounting the canvas and losing its pipeline.
    const handlePreviewOpenChange = (open: boolean) => {
        // Back is asynchronous; ignore repeated close requests while it is pending.
        if (closingPreview.current) return;

        if (open) {
            // Keep the editor mounted: Back should dismiss Preview, not leave /home.
            window.history.pushState(
                { ...window.history.state, [PREVIEW_HISTORY_KEY]: previewId },
                '',
                window.location.href
            );
            setPreviewOpen(true);
        } else {
            // Close immediately for a more responsive UX, even though
            // syncPreviewWithHistory will also close it when Back finishes.
            setPreviewOpen(false);
            // X, Escape and outside clicks must consume the same entry as Back.
            closingPreview.current = true;
            window.history.back();
        }
    };

    return (
        <OriginalSignalGraphNode
            {...props}
            dialogProps={{
                open: previewOpen,
                onOpenChange: handlePreviewOpenChange,
            }}
        />
    );
}

// Original node behavior; optional dialog props let the temporary component reuse
// the existing chart markup without duplicating the node implementation.
function OriginalSignalGraphNode({
    id,
    selected,
    data: nodeData,
    dialogProps,
}: SignalGraphNodeProps & {
    dialogProps?: Pick<
        React.ComponentProps<typeof Dialog>,
        'open' | 'onOpenChange'
    >;
}) {
    const { dataStreaming, activeSessionId } = useGlobalContext();
    const { channelLayout } = useWebSocketContext();
    const { renderData } = useNodeData(500, 10);
    const reactFlowInstance = useReactFlow();
    const { connected: isConnected } = useNodeConnection(id);
    const [seed, setSeed] = React.useState<ParsedEegCsv>(NO_SEED_DATA);

    // Live data uses the server's layout; saved data uses what the CSV holds
    const isLive = renderData.length > 0;
    const chartData = isLive ? renderData : seed.points;
    const layout = isLive
        ? resolveLayout(renderData, channelLayout)
        : seed.points.length > 0
          ? seed.layout
          : (channelLayout ?? genericLayout(0, 0));
    const hasBothGroups = availableGroups(layout).length > 1;
    const storedGroup = nodeData?.channelGroup;
    const channelGroup: ChannelGroupView = isChannelGroupView(storedGroup)
        ? storedGroup
        : 'both';

    // Fetch EEG data on load
    React.useEffect(() => {
        if (!id || !activeSessionId) return;

        const nodes = reactFlowInstance.getNodes();
        const currentNode = nodes.find((n) => n.id === id);
        if (!currentNode?.data) return;

        const { timeframeStart, timeframeEnd } = currentNode.data as {
            timeframeStart?: string;
            timeframeEnd?: string;
        };
        if (!timeframeStart || !timeframeEnd) return;

        (async () => {
            try {
                const csvContent = await exportEEGData(activeSessionId, {
                    start_time: timeframeStart,
                    end_time: timeframeEnd,
                });
                setSeed(parseEegCsv(csvContent));
            } catch (error) {
                console.debug('export failed', error);
                setSeed(NO_SEED_DATA);
            }
        })();
    }, [id, activeSessionId, reactFlowInstance]);

    // Merge fields into this node's data so they're saved with the pipeline
    const updateNodeData = (patch: Record<string, unknown>) => {
        if (!id) return;
        reactFlowInstance.setNodes((prevNodes) =>
            prevNodes.map((n) =>
                n.id === id ? { ...n, data: { ...n.data, ...patch } } : n
            )
        );
    };

    const handleTimeframeChange = (start: string, end: string) =>
        updateNodeData({ timeframeStart: start, timeframeEnd: end });

    const handleChannelGroupChange = (group: ChannelGroupView) =>
        updateNodeData({ channelGroup: group });

    return (
        <Dialog {...dialogProps}>
            <Card
                className={`rounded-[30px] border-2 shadow-none p-0 overflow-hidden bg-white h-[96px] w-[396px] transition-colors ${
                    selected
                        ? 'border-[#2E7B75] shadow-[0_0_0_3px_rgba(46,123,117,0.25)]'
                        : 'border-[#D3D3D3]'
                }`}
            >
                <div
                    className={`relative flex items-center transition-all duration-300 ease-in-out h-[94px] w-[394=2px]`}
                >
                    {/* Left circle with input (target) handle */}
                    <span
                        className={`absolute left-6 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center border-[3px] ${isConnected ? 'border-[#000000]' : 'border-[#D3D3D3]'}`}
                    >
                        {isConnected && (
                            <span className="w-3 h-3 rounded-full bg-white" />
                        )}
                        <Handle
                            type="target"
                            position={Position.Left}
                            id="signal-graph-input"
                            style={{
                                transform: 'translateY(-50%)',
                                width: '32px',
                                height: '32px',
                                backgroundColor: 'transparent',
                                border: '2px solid transparent',
                                borderRadius: '50%',
                                zIndex: 10,
                            }}
                        />
                    </span>
                    {/* Streaming status dot */}
                    <span
                        className={`absolute left-16 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full  ${dataStreaming && isConnected ? 'bg-[#509693]' : 'bg-[#D3D3D3]'}`}
                    />
                    <div className="flex flex-col items-start justify-center gap-1 ml-24">
                        <span className="font-geist text-[25px] font-[550] leading-none text-black tracking-wider">
                            Chart View
                        </span>
                        {isConnected && (
                            <div className="flex items-center gap-2">
                                <DialogTrigger asChild>
                                    <Button
                                        variant="nodeAction"
                                        size="node"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        Preview
                                    </Button>
                                </DialogTrigger>
                                {hasBothGroups && (
                                    <div
                                        role="radiogroup"
                                        aria-label="Signal group to show"
                                        className="nodrag flex rounded-full border border-[#2E7B75] overflow-hidden text-[12px]"
                                    >
                                        {GROUP_PICKER_OPTIONS.map((option) => (
                                            <button
                                                key={option.value}
                                                type="button"
                                                role="radio"
                                                aria-checked={
                                                    channelGroup ===
                                                    option.value
                                                }
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleChannelGroupChange(
                                                        option.value
                                                    );
                                                }}
                                                className={cn(
                                                    'px-2 py-0.5 transition-colors',
                                                    channelGroup ===
                                                        option.value
                                                        ? 'bg-[#2E7B75] text-white'
                                                        : 'bg-white text-[#2E7B75] hover:bg-[#EAF1F0]'
                                                )}
                                            >
                                                {option.label}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    {/* Right decorative circle only (no output handle for end of pipeline) */}
                    <span
                        className={`absolute right-6 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center border-[3px] ${isConnected ? 'border-[#000000]' : ' border-[#D3D3D3]'}`}
                    >
                        {isConnected && (
                            <span className="w-3 h-3 rounded-full bg-white" />
                        )}
                    </span>
                </div>

                <DialogContent
                    className="items-center justify-center w-screen h-screen max-w-none max-h-none"
                    style={{ backgroundColor: '#EAF1F0' }}
                >
                    <DialogHeader>
                        <DialogTitle></DialogTitle>
                        <DialogDescription></DialogDescription>
                    </DialogHeader>
                    <div className="w-[85vw] h-[90vh]">
                        <SignalGraphView
                            data={chartData}
                            layout={layout}
                            view={channelGroup}
                            onViewChange={handleChannelGroupChange}
                            onTimeframeChange={handleTimeframeChange}
                        />
                    </div>
                </DialogContent>
            </Card>
        </Dialog>
    );
}
