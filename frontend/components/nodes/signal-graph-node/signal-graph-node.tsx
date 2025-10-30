import { Card } from '@/components/ui/card';
import { Handle, Position, useReactFlow } from '@xyflow/react';
import useWebsocket from '@/hooks/useWebsocket';
import React from 'react';
import { useGlobalContext } from '@/context/GlobalContext';
import { ArrowUpRight } from 'lucide-react';

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import SignalGraphView from './signal-graph-full';

export default function SignalGraphNode({ id }: { id?: string }) {
    const { renderData } = useWebsocket(20, 10);

    const processedData = renderData.map((item) => ({
        time: item.time,
        signal1: item.signals[0],
        signal2: item.signals[1],
        signal3: item.signals[2],
        signal4: item.signals[3],
        signal5: item.signals[4],
    }));

    const reactFlowInstance = useReactFlow();
    const [isConnected, setIsConnected] = React.useState(false);
    const { dataStreaming } = useGlobalContext()

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

    return (
        <Dialog>
            <Card className="rounded-[30px] border-2 border-[#D3D3D3] shadow-none p-0 overflow-hidden bg-white">
            <div className={`relative flex items-center transition-all duration-300 ease-in-out h-[96px] w-[396px]`}>
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
                            <div className="w-full mt-[50px] transition-all duration-300 ease-in-out">
                                <DialogTrigger asChild>
                                    <button
                                        className="font-geist text-[14px] font-normal leading-tight text-black flex items-center gap-1 hover:opacity-80 transition"
                                        onClick={(e) => e.stopPropagation()}>
                                        Preview <ArrowUpRight size={14} className="transition-transform duration-200 hover:scale-110" />
                                    </button>
                                </DialogTrigger>
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


                <DialogContent className="w-[80vw] h-[80vh] max-w-none max-h-none">
                    <DialogHeader>
                        <DialogTitle>Signal Graph</DialogTitle>
                        <DialogDescription>
                            Here is a preview of the signal graph.
                        </DialogDescription>
                    </DialogHeader>
                    <Card>
                        <div className="w-full h-full">
                            <SignalGraphView data={isConnected ? processedData : []} />
                        </div>
                    </Card>
                </DialogContent>
            </Card>
        </Dialog>
    );
}