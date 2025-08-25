import { Card } from '@/components/ui/card';
import { Edge, Handle, Node, Position, useReactFlow } from '@xyflow/react';
import useWebsocket from '@/hooks/useWebsocket';
import { useState } from 'react';
import { useGlobalContext } from '@/context/GlobalContext';

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import SignalGraphView from './signal-graph-full';

export default function SignalGraphNode() {
    const { renderData } = useWebsocket(20, 10);

    const processedData = renderData.map((item) => ({
        time: item.time,
        signal1: item.signals[0],
        signal2: item.signals[1],
        signal3: item.signals[2],
        signal4: item.signals[3],
        signal5: item.signals[4],
    }));

    const { getEdges, getNodes } = useReactFlow();
    const nodes = getNodes();
    const edges = getEdges();

    const areNodeTypesConnected = (nodes: Node[], edges: Edge[], typeA: string, typeB: string, typeC: string) => {
        const nodeMap = Object.fromEntries(nodes.map((n) => [n.id, n]));
      
        return edges.some((edge) => {
          const sourceNode = nodeMap[edge.source];
          const targetNode = nodeMap[edge.target];
      
          return ((sourceNode?.type === typeA || sourceNode?.type === typeC) && targetNode?.type === typeB);
        });
    };

    const connected = areNodeTypesConnected(nodes, edges, 'source-node', 'signal-graph-node', 'filter-node');

    if (connected) {
        console.log('At least one inputNode is connected to an outputNode');
    }

    const [isConnected, setIsConnected] = useState(false);
    const { dataStreaming } = useGlobalContext()
    
    return (
        <Dialog>
        <Card className="rounded-[30px]">
            <div onClick={() => setIsConnected(!isConnected)}
            className="relative w-[396px] h-[96px] flex bg-white rounded-[30px] border-2 border-[#D3D3D3] shadow-none p-0">
            <span
                className={`absolute left-6 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center border-[3px] ${isConnected ? 'border-[#000000]' : ' border-[#D3D3D3]'}`}>
                {isConnected && (
                    <span className="w-3 h-3 rounded-full bg-white" />
                )}
                <Handle
                    type="source"
                    position={Position.Left}
                    className="absolute mr-2 h-3 w-3 !bg-white rounded-full"
                    onConnect={() => setIsConnected(!isConnected)}
                />
                <Handle
                    type="target"
                    position={Position.Right}
                    className="absolute mr-2 h-3 w-3 !bg-white rounded-full"
                    onConnect={() => setIsConnected(!isConnected)}
                />
            </span>
            <span
                className={`absolute left-16 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full  ${dataStreaming && isConnected ? 'bg-[#509693]' : 'bg-[#D3D3D3]'}`}
            />
            <div className="flex flex-col items-start justify-center ml-24">
                <span className="font-geist text-[25px] font-[550] leading-tight text-black">
                    Chart View
                </span>
                <DialogTrigger asChild>
                            <button
                                className="font-geist text-[14px] font-light leading-tight text-black mt-0 underline underline-offset-2 hover:opacity-80 transition"
                                onClick={(e) => e.stopPropagation()}>
                                Preview
                            </button>
                </DialogTrigger>
            </div>
            <span
                className={`absolute right-6 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center border-[3px] ${isConnected ? 'border-[#000000]' : ' border-[#D3D3D3]'}`}
            >
                {isConnected && (
                    <span className="w-3 h-3 rounded-full bg-white" />
                )}
                <Handle
                    type="source"
                    position={Position.Right}
                    className="absolute mr-2 h-3 w-3 !bg-white rounded-full"
                    onConnect={() => setIsConnected(!isConnected)}
                />
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
                        <SignalGraphView data={connected? processedData : []} />
                    </div>
                </Card>
            </DialogContent>
            </Card>
        </Dialog>
    );
}
