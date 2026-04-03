import { Card } from '@/components/ui/card';
import { Handle, Position, useReactFlow } from '@xyflow/react';
import { useGlobalContext } from '@/context/GlobalContext';
import useNodeData from '@/hooks/useNodeData';
import { ArrowUpRight, Download } from 'lucide-react';
import React, { useState } from 'react';

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import SignalGraphView from './signal-graph-full';
import ExportDialog from '@/components/ui/export-dialog';
import { exportEEGData } from '@/lib/eeg-api';

interface SignalDataPoint {
    time: string;
    signal1: number;
    signal2: number;
    signal3: number;
    signal4: number;
}

function parseEEG(csvContent: string): SignalDataPoint[] {
    try {
        const lines = csvContent.trim().split('\n');
        if (lines.length < 2) return [];

        const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
        // find time column
        const timeColIdx = header.findIndex((h) => h.includes('time') || h === 'timestamp');
        if (timeColIdx == -1) return [];

        // find signal columns by exact channel number patterns
        const signalIndices = [0, 1, 2, 3].map((chNum) => {
            const patterns = [`ch${chNum}`, `channel${chNum}`, `signal${chNum + 1}`, `signal_${chNum + 1}`];
            return header.findIndex((h) => patterns.includes(h));
        });

        if (signalIndices.includes(-1)) return [];

        const data: SignalDataPoint[] = [];
        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].trim().split(',').map((c) => c.trim());
            if (!cols[timeColIdx]) continue;
            
            const vals = signalIndices.map((idx) => parseFloat(cols[idx]));
            if (vals.every((v) => !isNaN(v))) {
                data.push({
                    time: cols[timeColIdx],
                    signal1: vals[0],
                    signal2: vals[1],
                    signal3: vals[2],
                    signal4: vals[3],
                });
            }
        }
        return data;
    } catch (err) {
        console.error('Failed to parse EEG CSV:', err);
        return [];
    }
}

export default function SignalGraphNode({ id }: { id?: string }) {
    const { dataStreaming, activeSessionId } = useGlobalContext();
    const { renderData } = useNodeData(500, 10);
    const reactFlowInstance = useReactFlow();
    const [isConnected, setIsConnected] = React.useState(false);
    const [isExportOpen, setIsExportOpen] = useState(false);
    const [seedData, setSeedData] = React.useState<SignalDataPoint[]>([]);

    // Determine if this Chart View node has an upstream path from a Source
    const checkConnectionStatus = React.useCallback(() => {
        try {
            const edges = reactFlowInstance.getEdges();
            const nodes = reactFlowInstance.getNodes();

            const findNodeById = (nodeId: string | undefined) =>
                nodes.find((n) => n.id === nodeId);

            const reachesSource = (nodeId: string, visited: Set<string> = new Set()): boolean => {
                if (visited.has(nodeId)) return false;
                visited.add(nodeId);
                const incoming = edges.filter((e) => e.target === nodeId);
                for (const inEdge of incoming) {
                    const upNode = findNodeById(inEdge.source);
                    if (!upNode) continue;
                    if (upNode.type === 'source-node') return true;
                    if (reachesSource(upNode.id, visited)) return true;
                }
                return false;
            };

            const activated = id ? reachesSource(id) : false;
            setIsConnected(activated);
        } catch (err) {
            setIsConnected(false);
        }
    }, [id, reactFlowInstance]);

    React.useEffect(() => {
        checkConnectionStatus();
        const handleEdgeChange = () => checkConnectionStatus();
        window.addEventListener('reactflow-edges-changed', handleEdgeChange);
        const interval = setInterval(checkConnectionStatus, 1000);
        return () => {
            window.removeEventListener('reactflow-edges-changed', handleEdgeChange);
            clearInterval(interval);
        };
    }, [checkConnectionStatus]);

    // Fetch EEG data on load
    React.useEffect(() => {
        if (!id || !activeSessionId) return;

        const nodes = reactFlowInstance.getNodes();
        const currentNode = nodes.find((n) => n.id === id);
        if (!currentNode?.data) return;

        const { timeframeStart, timeframeEnd } = currentNode.data as { timeframeStart?: string; timeframeEnd?: string };
        if (!timeframeStart || !timeframeEnd) return;

        console.log('restored timeframe:', { timeframeStart, timeframeEnd });
        (async () => {
            try {
                const csvContent = await exportEEGData(activeSessionId, { start_time: timeframeStart, end_time: timeframeEnd });
                setSeedData(parseEEG(csvContent)); // store as seed data
                console.log('loaded saved data');
            } catch (err) {
                console.debug('export failed', err);
                setSeedData([]);
            }
        })();
    }, [id, activeSessionId, reactFlowInstance]);

    // Save timeframe in node data
    const handleTimeframeChange = (start: string, end: string) => {
        if (!id) return;
        reactFlowInstance.setNodes((prevNodes) =>
            prevNodes.map((n) =>
                n.id === id ? { ...n, data: { ...n.data, timeframeStart: start, timeframeEnd: end } } : n
            )
        );
    };

    return (
        <Dialog>
            <Card className="rounded-[30px] border-2 border-[#D3D3D3] shadow-none p-0 overflow-hidden bg-white h-[96px] w-[396px]">
                <div className={`relative flex items-center transition-all duration-300 ease-in-out h-[94px] w-[394=2px]`}>
                    {/* Left circle with input (target) handle */}
                    <span
                        className={`absolute left-6 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center border-[3px] ${isConnected ? 'border-[#000000]' : 'border-[#D3D3D3]'}`}>
                        {isConnected && (
                            <span className="w-3 h-3 rounded-full bg-white" />
                        )}
                        <Handle
                            type="target"
                            position={Position.Left}
                            id="signal-graph-input"
                            style={{

                                transform: 'translateY(-50%)',
                                width: '18px',
                                height: '18px',
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
                    <div className="flex flex-col items-start justify-center ml-24">
                        <span className="absolute font-geist text-[25px] font-[550] leading-tight text-black tracking-wider">
                            Chart View
                        </span>
                        {isConnected && (
                            <div className="w-full mt-[50px] transition-all duration-300 ease-in-out flex items-center gap-3">
                                <DialogTrigger asChild>
                                    <button
                                        className="font-geist text-[14px] font-normal leading-tight text-black flex items-center gap-1 hover:opacity-80 transition"
                                        onClick={(e) => e.stopPropagation()}>
                                        Preview <ArrowUpRight size={14} className="transition-transform duration-200 hover:scale-110" />
                                    </button>
                                </DialogTrigger>
                                <button
                                    className="font-geist text-[14px] font-normal leading-tight text-black flex items-center gap-1 hover:opacity-80 transition"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setIsExportOpen(true);
                                    }}
                                >
                                    Export <Download size={14} className="transition-transform duration-200 hover:scale-110" />
                                </button>
                            </div>
                        )}
                    </div>
                    {/* Right decorative circle only (no output handle for end of pipeline) */}
                    <span
                        className={`absolute right-6 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center border-[3px] ${isConnected ? 'border-[#000000]' : ' border-[#D3D3D3]'}`}
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
                            data={seedData.length > 0 ? seedData : (isConnected ? renderData : [])}
                            onTimeframeChange={handleTimeframeChange}
                        />
                    </div>
                </DialogContent>
            </Card>

            {/* Export dialog — outside the ReactFlow Dialog to avoid nesting */}
            <ExportDialog
                open={isExportOpen}
                sessionId={activeSessionId}
                onOpenChange={setIsExportOpen}
            />
        </Dialog>
    );
}