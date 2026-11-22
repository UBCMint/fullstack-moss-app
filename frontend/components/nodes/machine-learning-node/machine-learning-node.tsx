'use client';
import React from 'react';
import { useNodeConnection } from '../use-node-connection';
import { Handle, Position, useReactFlow } from '@xyflow/react';
import { useGlobalContext } from '@/context/GlobalContext';
import MLComboBox from './ml-combo-box';

interface MachineLearningNodeProps {
    id?: string;
    // data?: any;
    selected?: boolean;
}

export default function MachineLearningNode({
    id,
    selected,
}: MachineLearningNodeProps) {
    const [selectedPrediction, setSelectedPrediction] =
        React.useState('Stress');
    const { connected: isConnected, hint } = useNodeConnection(id);

    // Get React Flow instance
    const reactFlowInstance = useReactFlow();

    // Get data stream status from global context
    const { dataStreaming } = useGlobalContext();

    const pushConfigToNodeData = React.useCallback(() => {
        if (!id) return;
        const config = { model: selectedPrediction };
        reactFlowInstance.setNodes((nds) =>
            nds.map((n) =>
                n.id === id ? { ...n, data: { ...n.data, config } } : n
            )
        );
        window.dispatchEvent(new Event('node-config-changed'));
    }, [id, reactFlowInstance, selectedPrediction]);

    React.useEffect(() => {
        pushConfigToNodeData();
    }, [pushConfigToNodeData]);

    return (
        <fieldset
            disabled={dataStreaming}
            className={`relative w-[396px] min-h-[90px] flex bg-white rounded-[30px] border-2 shadow-none p-0 transition-all duration-300 ease-in-out ${
                selected
                    ? 'border-[#2E7B75] shadow-[0_0_0_3px_rgba(46,123,117,0.25)]'
                    : 'border-[#D3D3D3]'
            }`}
        >
            {/* Input Handle - positioned to align with left circle */}
            <div>
                <Handle
                    type="target"
                    position={Position.Left}
                    id="ml-input"
                    style={{
                        left: '17px',
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
            </div>

            {/* Output Handle - positioned to align with right circle */}
            <Handle
                type="source"
                position={Position.Right}
                id="ml-output"
                style={{
                    right: '24px', // Align with right circle position
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
            {/* Only one target on the left and one source on the right */}
            {/* Just the MLComboBox without Card wrapper */}
            <MLComboBox
                value={selectedPrediction}
                onValueChange={setSelectedPrediction}
                isConnected={isConnected}
                connectionHint={hint}
                isDataStreamOn={dataStreaming}
            />
        </fieldset>
    );
}
