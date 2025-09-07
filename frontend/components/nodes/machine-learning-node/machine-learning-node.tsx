'use client';
import React from 'react';
import { Handle, Position, useReactFlow } from '@xyflow/react';
import { useGlobalContext } from '@/context/GlobalContext';
import MLComboBox from './ml-combo-box';

interface MachineLearningNodeProps {
    id?: string;
    // data?: any;
}

export default function MachineLearningNode({ id }: MachineLearningNodeProps) {
    const [selectedPrediction, setSelectedPrediction] =
        React.useState('stress');
    const [isConnected, setIsConnected] = React.useState(false);

    // Get React Flow instance
    const reactFlowInstance = useReactFlow();

    // Get data stream status from global context
    const { dataStreaming } = useGlobalContext();

    // Check connection status and update state
    const checkConnectionStatus = React.useCallback(() => {
        try {
            const edges = reactFlowInstance.getEdges();
            const nodes = reactFlowInstance.getNodes();

            const findNodeById = (nodeId: string | undefined) =>
                nodes.find((n) => n.id === nodeId);

            // Determine if ML node has immediate Filter predecessor which itself reaches a Source
            const mlHasValidUpstream = (mlNodeId: string): boolean => {
                // Incoming edges into ML
                const incomingToMl = edges.filter((e) => e.target === mlNodeId);
                if (incomingToMl.length === 0) return false;

                // Any incoming from a Filter node?
                for (const edge of incomingToMl) {
                    const sourceNode = findNodeById(edge.source);
                    if (!sourceNode) continue;
                    if (sourceNode.type !== 'filter-node') continue;

                    // For this filter node, check it ultimately connects to a Source
                    const visited = new Set<string>();
                    const reachesSource = (nodeId: string): boolean => {
                        if (visited.has(nodeId)) return false;
                        visited.add(nodeId);
                        const incoming = edges.filter((e) => e.target === nodeId);
                        for (const inEdge of incoming) {
                            const upNode = findNodeById(inEdge.source);
                            if (!upNode) continue;
                            if (upNode.type === 'source-node') return true;
                            if (reachesSource(upNode.id)) return true;
                        }
                        return false;
                    };

                    if (reachesSource(sourceNode.id)) return true;
                }

                return false;
            };

            const isActivated = id ? mlHasValidUpstream(id) : false;
            setIsConnected(isActivated);
        } catch (error) {
            console.error('Error checking connection:', error);
            setIsConnected(false);
        }
    }, [id, reactFlowInstance]);

    // Check connection status on mount and when edges might change
    React.useEffect(() => {
        checkConnectionStatus();

        // Listen for custom edge change events
        const handleEdgeChange = () => {
            checkConnectionStatus();
        };

        window.addEventListener('reactflow-edges-changed', handleEdgeChange);

        // Also set up periodic check as backup
        const interval = setInterval(checkConnectionStatus, 1000);

        return () => {
            window.removeEventListener(
                'reactflow-edges-changed',
                handleEdgeChange
            );
            clearInterval(interval);
        };
    }, [checkConnectionStatus]);

    return (
        <div className="relative w-[396px] min-h-[90px] flex bg-white rounded-[30px] border-2 border-[#D3D3D3] shadow-none p-0 transition-all duration-300 ease-in-out">
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
                        width: '28px',
                        height: '28px',
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
                    width: '28px',
                    height: '28px',
                    backgroundColor: 'transparent',
                    border: '2px solid transparent',
                    borderRadius: '50%',
                    zIndex: 20,
                    cursor: 'crosshair',
                    pointerEvents: 'all',
                }}
                className="hover:border-blue-500"
            />
            {/* Only one target on the left and one source on the right */}
            {/* Just the MLComboBox without Card wrapper */}
            <MLComboBox
                value={selectedPrediction}
                onValueChange={setSelectedPrediction}
                isConnected={isConnected}
                isDataStreamOn={dataStreaming}
            />
        </div>
    );
}
