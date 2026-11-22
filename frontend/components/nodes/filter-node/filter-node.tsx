'use client';
import { useGlobalContext } from '@/context/GlobalContext';

import { Handle, Position, useReactFlow } from '@xyflow/react';
import React from 'react';
import { useNodeConnection } from '../use-node-connection';
import ComboBox from './combo-box';

interface FilterConfig {
    apply_bandpass: boolean;
    use_iir: boolean;
    l_freq: number | null;
    h_freq: number | null;
    downsample_factor: number | null;
    sfreq: number;
    n_channels: number;
}

interface FilterNodeProps {
    id?: string;
    data?: {
        _highCutoff?: number;
        _lowCutoff?: number;
        _selectedFilter?: string;
        config?: FilterConfig;
    };
    selected?: boolean;
}

export default function FilterNode({ id, data, selected }: FilterNodeProps) {
    const [selectedFilter, setSelectedFilter] = React.useState(
        data?._selectedFilter ?? 'lowpass'
    );
    const { connected: isConnected } = useNodeConnection(id);
    const [lowCutoff, setLowCutoff] = React.useState(data?._lowCutoff ?? 1);
    const [highCutoff, setHighCutoff] = React.useState(data?._highCutoff ?? 50);

    // Get React Flow instance
    const reactFlowInstance = useReactFlow();

    const { dataStreaming } = useGlobalContext();

    const buildConfig = React.useCallback((): FilterConfig => {
        if (!isConnected) {
            return {
                apply_bandpass: false,
                use_iir: false,
                l_freq: null,
                h_freq: null,
                downsample_factor: null,
                sfreq: 256,
                n_channels: 4,
            };
        }

        switch (selectedFilter) {
            case 'lowpass':
                return {
                    apply_bandpass: true,
                    use_iir: false,
                    l_freq: null,
                    h_freq: highCutoff,
                    downsample_factor: null,
                    sfreq: 256,
                    n_channels: 4,
                };

            case 'highpass':
                return {
                    apply_bandpass: true,
                    use_iir: false,
                    l_freq: lowCutoff,
                    h_freq: null,
                    downsample_factor: null,
                    sfreq: 256,
                    n_channels: 4,
                };

            case 'bandpass':
                return {
                    apply_bandpass: true,
                    use_iir: false,
                    l_freq: lowCutoff,
                    h_freq: highCutoff,
                    downsample_factor: null,
                    sfreq: 256,
                    n_channels: 4,
                };

            default:
                throw new Error(`Unhandled filter type: ${selectedFilter}`);
        }
    }, [isConnected, selectedFilter, lowCutoff, highCutoff]);

    // write config to node data for later retrieval when dispatching pipeline payload
    const pushConfigToNodeData = React.useCallback(() => {
        if (!id) return;
        if (!isConnected) return; // Don't push config if not connected
        const config = buildConfig();
        reactFlowInstance.setNodes((nds) =>
            nds.map((n) =>
                n.id === id
                    ? {
                          ...n,
                          data: {
                              ...n.data,
                              config,
                              _highCutoff: highCutoff,
                              _lowCutoff: lowCutoff,
                              _selectedFilter: selectedFilter,
                          },
                      }
                    : n
            )
        );
        window.dispatchEvent(new Event('node-config-changed'));
    }, [
        id,
        reactFlowInstance,
        buildConfig,
        isConnected,
        highCutoff,
        lowCutoff,
        selectedFilter,
    ]);

    // Push config to node data and dispatch processing config when relevant state changes
    React.useEffect(() => {
        pushConfigToNodeData();
    }, [pushConfigToNodeData]);

    return (
        <fieldset disabled={dataStreaming} className="relative">
            {/* Input Handle - positioned to align with left circle */}
            <Handle
                type="target"
                position={Position.Left}
                id="filter-input"
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
                id="filter-output"
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
            <ComboBox
                value={selectedFilter}
                onValueChange={setSelectedFilter}
                lowCutoff={lowCutoff}
                highCutoff={highCutoff}
                setLowCutoff={setLowCutoff}
                setHighCutoff={setHighCutoff}
                isConnected={isConnected}
                isDataStreamOn={dataStreaming}
                isNodeSelected={selected}
            />
        </fieldset>
    );
}
