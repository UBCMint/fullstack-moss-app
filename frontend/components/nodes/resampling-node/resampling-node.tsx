'use client';
import { useGlobalContext } from '@/context/GlobalContext';
import { Handle, Position, useReactFlow } from '@xyflow/react';
import React from 'react';
import ResamplingComboBox, { ResampleRate } from './resampling-combo-box';

interface ResamplingNodeProps {
    id: string;
    data?: any;
}

export default function ResamplingNode({ id, data }: ResamplingNodeProps) {
    const [rate, setRate] = React.useState<ResampleRate>(data?.rate ?? '256');
    const [customRate, setCustomRate] = React.useState<number>(data?.customRate ?? 256);
    const [isConnected, setIsConnected] = React.useState(false);

    const reactFlowInstance = useReactFlow();
    const { dataStreaming } = useGlobalContext();

    // Persist state to node data
    React.useEffect(() => {
        reactFlowInstance.updateNodeData(id, { rate, customRate });
    }, [id, rate, customRate, reactFlowInstance]);

    // Dispatch config update for future websocket integration
    React.useEffect(() => {
        const hz = rate === 'input' ? null : rate === 'custom' ? customRate : Number(rate);
        window.dispatchEvent(new CustomEvent('resampling-config-update', { detail: { resample_hz: hz } }));
    }, [rate, customRate]);

    const checkConnectionStatus = React.useCallback(() => {
        try {
            const edges = reactFlowInstance.getEdges();
            const nodes = reactFlowInstance.getNodes();
            const reachesSource = (nodeId: string, visited: Set<string> = new Set()): boolean => {
                if (visited.has(nodeId)) return false;
                visited.add(nodeId);
                for (const edge of edges.filter((e) => e.target === nodeId)) {
                    const src = nodes.find((n) => n.id === edge.source);
                    if (!src) continue;
                    if (src.type === 'source-node') return true;
                    if (reachesSource(src.id, visited)) return true;
                }
                return false;
            };
            setIsConnected(id ? reachesSource(id) : false);
        } catch {
            setIsConnected(false);
        }
    }, [id, reactFlowInstance]);

    React.useEffect(() => {
        checkConnectionStatus();
        window.addEventListener('reactflow-edges-changed', checkConnectionStatus);
        const interval = setInterval(checkConnectionStatus, 1000);
        return () => {
            window.removeEventListener('reactflow-edges-changed', checkConnectionStatus);
            clearInterval(interval);
        };
    }, [checkConnectionStatus]);

    return (
        <div className="relative">
            <Handle
                type="target"
                position={Position.Left}
                id="resampling-input"
                style={{
                    left: '24px', top: '45px',
                    transform: 'translateY(-50%)',
                    width: '28px', height: '28px',
                    backgroundColor: 'transparent',
                    border: '2px solid transparent',
                    borderRadius: '50%',
                    zIndex: 20, cursor: 'crosshair', pointerEvents: 'all',
                }}
            />
            <Handle
                type="source"
                position={Position.Right}
                id="resampling-output"
                style={{
                    right: '24px', top: '45px',
                    transform: 'translateY(-50%)',
                    width: '28px', height: '28px',
                    backgroundColor: 'transparent',
                    border: '2px solid transparent',
                    borderRadius: '50%',
                    zIndex: 20, cursor: 'crosshair', pointerEvents: 'all',
                }}
            />
            <ResamplingComboBox
                rate={rate}
                customRate={customRate}
                onRateChange={setRate}
                onCustomRateChange={setCustomRate}
                isConnected={isConnected}
                isDataStreamOn={dataStreaming}
            />
        </div>
    );
}
