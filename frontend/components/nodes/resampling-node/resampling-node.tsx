'use client';
import { useGlobalContext } from '@/context/GlobalContext';
import { Handle, Position, useReactFlow } from '@xyflow/react';
import React from 'react';
import { useNodeConnection } from '../use-node-connection';
import ResamplingComboBox, { ResampleRate } from './resampling-combo-box';

interface ResamplingNodeData {
    rate?: ResampleRate;
    customRate?: number;
}

interface ResamplingNodeProps {
    id: string;
    data?: ResamplingNodeData;
    selected?: boolean;
}

export default function ResamplingNode({
    id,
    data,
    selected,
}: ResamplingNodeProps) {
    const [rate, setRate] = React.useState<ResampleRate>(data?.rate ?? '256');
    const [customRate, setCustomRate] = React.useState<number>(
        data?.customRate ?? 256
    );
    const { connected: isConnected } = useNodeConnection(id);

    const reactFlowInstance = useReactFlow();
    const { dataStreaming } = useGlobalContext();

    // Persist state to node data
    React.useEffect(() => {
        reactFlowInstance.updateNodeData(id, { rate, customRate });
        window.dispatchEvent(new Event('node-config-changed'));
    }, [id, rate, customRate, reactFlowInstance]);

    // Dispatch config update for future websocket integration
    React.useEffect(() => {
        const hz =
            rate === 'input'
                ? null
                : rate === 'custom'
                  ? customRate
                  : Number(rate);
        window.dispatchEvent(
            new CustomEvent('resampling-config-update', {
                detail: { resample_hz: hz },
            })
        );
    }, [rate, customRate]);

    return (
        <fieldset disabled={dataStreaming} className="relative">
            <Handle
                type="target"
                position={Position.Left}
                id="resampling-input"
                style={{
                    left: '24px',
                    top: '45px',
                    transform: 'translateY(-50%)',
                    width: '32px',
                    height: '32px',
                    backgroundColor: 'transparent',
                    border: '2px solid transparent',
                    borderRadius: '50%',
                    zIndex: 20,
                    cursor: 'crosshair',
                    pointerEvents: 'all',
                }}
            />
            <Handle
                type="source"
                position={Position.Right}
                id="resampling-output"
                style={{
                    right: '24px',
                    top: '45px',
                    transform: 'translateY(-50%)',
                    width: '32px',
                    height: '32px',
                    backgroundColor: 'transparent',
                    border: '2px solid transparent',
                    borderRadius: '50%',
                    zIndex: 20,
                    cursor: 'crosshair',
                    pointerEvents: 'all',
                }}
            />
            <ResamplingComboBox
                rate={rate}
                customRate={customRate}
                onRateChange={setRate}
                onCustomRateChange={setCustomRate}
                isConnected={isConnected}
                isDataStreamOn={dataStreaming}
                isNodeSelected={selected}
            />
        </fieldset>
    );
}
