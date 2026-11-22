'use client';
import { useGlobalContext } from '@/context/GlobalContext';
import { Handle, Position, useReactFlow } from '@xyflow/react';
import React from 'react';
import { useNodeConnection } from '../use-node-connection';
import WindowComboBox, { type WindowOption } from './window-combo-box';

interface WindowNodeProps {
    id?: string;
    data?: {
        config?: { chunk_size?: number; overlap_size?: number };
        selectedOption?: WindowOption;
    };
    selected?: boolean;
}

export default function WindowNode({ id, data, selected }: WindowNodeProps) {
    const DEFAULT_WINDOW_SIZE = 64;
    const DEFAULT_OVERLAP_SIZE = 0;

    const [windowSize, setWindowSize] = React.useState<number>(
        data?.config?.chunk_size ?? DEFAULT_WINDOW_SIZE
    );
    const [overlapSize, setOverlapSize] = React.useState<number>(
        data?.config?.overlap_size ?? DEFAULT_OVERLAP_SIZE
    );
    const [selectedOption, setSelectedOption] = React.useState<WindowOption>(
        data?.selectedOption ?? 'default'
    );

    const { connected: isConnected } = useNodeConnection(id);

    // Get React Flow instance
    const reactFlowInstance = useReactFlow();

    const { dataStreaming } = useGlobalContext();

    const buildConfig = React.useCallback(
        () => ({
            chunk_size: windowSize,
            overlap_size: overlapSize,
        }),
        [windowSize, overlapSize]
    );

    // Validate config values
    const isValidConfig =
        Number.isInteger(windowSize) &&
        windowSize > 0 &&
        Number.isInteger(overlapSize) &&
        overlapSize >= 0 &&
        overlapSize < windowSize;

    // Push config to node data and dispatch processing config when relevant state changes
    const pushConfigToNodeData = React.useCallback(() => {
        if (!id) return;
        if (!isValidConfig) return;
        const config = buildConfig();
        reactFlowInstance.setNodes((nds) =>
            nds.map((n) =>
                n.id === id
                    ? { ...n, data: { ...n.data, config, selectedOption } }
                    : n
            )
        );
        window.dispatchEvent(new Event('node-config-changed'));
    }, [id, reactFlowInstance, buildConfig, selectedOption, isValidConfig]);

    // Push config to node data and dispatch processing config when relevant state changes
    React.useEffect(() => {
        if (!isValidConfig) return;
        pushConfigToNodeData();
    }, [pushConfigToNodeData, isValidConfig]);

    return (
        <fieldset disabled={dataStreaming} className="relative">
            {/* Input Handle - positioned to align with left circle */}
            <Handle
                type="target"
                position={Position.Left}
                id="window-input"
                style={{
                    left: '24px',
                    top: '30px',
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

            {/* Output Handle - positioned to align with right circle */}
            <Handle
                type="source"
                position={Position.Right}
                id="window-output"
                style={{
                    right: '24px',
                    top: '30px',
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

            {/* Just the ComboBox without Card wrapper */}
            <WindowComboBox
                windowSize={windowSize}
                overlapSize={overlapSize}
                selectedOption={selectedOption}
                setWindowSize={setWindowSize}
                setOverlapSize={setOverlapSize}
                setSelectedOption={setSelectedOption}
                isConnected={isConnected}
                isDataStreamOn={dataStreaming}
                isNodeSelected={selected}
            />
        </fieldset>
    );
}
