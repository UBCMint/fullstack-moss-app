'use client';
import { useGlobalContext } from '@/context/GlobalContext';
import { Handle, Position, useReactFlow } from '@xyflow/react';
import React from 'react';
import ArtifactComboBox, { ArtifactMode } from './artifact-combo-box';

interface ArtifactNodeProps {
    id: string;
    data?: any;
}

export default function ArtifactNode({ id, data }: ArtifactNodeProps) {
    // Initial values from data or defaults
    const [mode, setMode] = React.useState<ArtifactMode>(data?.mode || 'auto');
    const [selectedArtifacts, setSelectedArtifacts] = React.useState<string[]>(data?.selectedArtifacts || ['eye_blink']);
    const [intensity, setIntensity] = React.useState<number>(data?.intensity || 50);
    
    const [isConnected, setIsConnected] = React.useState(false);
    
    const reactFlowInstance = useReactFlow();
    const { dataStreaming } = useGlobalContext();

    // Persist data updates to React Flow node state
    React.useEffect(() => {
        reactFlowInstance.updateNodeData(id, {
            mode,
            selectedArtifacts,
            intensity,
        });
    }, [id, mode, selectedArtifacts, intensity, reactFlowInstance]);

    const checkConnectionStatus = React.useCallback(() => {
        try {
            const edges = reactFlowInstance.getEdges();
            const nodes = reactFlowInstance.getNodes();
            
            const isConnectedToActivatedNode = (nodeId: string, visited: Set<string> = new Set()): boolean => {
                if (visited.has(nodeId)) return false; 
                visited.add(nodeId);
                
                const incomingEdges = edges.filter(edge => edge.target === nodeId);
                
                for (const edge of incomingEdges) {
                    const sourceNode = nodes.find(n => n.id === edge.source);
                    if (!sourceNode) continue;
                    
                    if (sourceNode.type === 'source-node') {
                        return true;
                    }
                    
                    if (sourceNode.id && isConnectedToActivatedNode(sourceNode.id, visited)) {
                        return true;
                    }
                }
                
                return false;
            };
            
            const isActivated = id ? isConnectedToActivatedNode(id) : false;
            setIsConnected(isActivated);
        } catch (error) {
            console.error('Error checking connection:', error);
            setIsConnected(false);
        }
    }, [id, reactFlowInstance]);
    
    React.useEffect(() => {
        checkConnectionStatus();
        
        const handleEdgeChange = () => {
            checkConnectionStatus();
        };
        
        window.addEventListener('reactflow-edges-changed', handleEdgeChange);
        const interval = setInterval(checkConnectionStatus, 1000);
        
        return () => {
            window.removeEventListener('reactflow-edges-changed', handleEdgeChange);
            clearInterval(interval);
        };
    }, [checkConnectionStatus]);


    return (
        <div className="relative">
            {/* Input Handle */}
            <Handle 
                type="target" 
                position={Position.Left}
                id="artifact-input"
                style={{ 
                    left: '24px',
                    top: '35px',
                    transform: 'translateY(-50%)',
                    width: '28px',
                    height: '28px',
                    backgroundColor: 'transparent',
                    border: '2px solid transparent',
                    borderRadius: '50%',
                    zIndex: 20,
                    cursor: 'crosshair',
                    pointerEvents: 'all'
                }}
            />
            
            {/* Output Handle */}
            <Handle 
                type="source" 
                position={Position.Right}
                id="artifact-output"
                style={{ 
                    right: '24px',
                    top: '35px',
                    transform: 'translateY(-50%)',
                    width: '28px',
                    height: '28px',
                    backgroundColor: 'transparent',
                    border: '2px solid transparent',
                    borderRadius: '50%',
                    zIndex: 20,
                    cursor: 'crosshair',
                    pointerEvents: 'all'
                }}
            />

            <ArtifactComboBox 
                mode={mode}
                onModeChange={setMode}
                selectedArtifacts={selectedArtifacts}
                onSelectedArtifactsChange={setSelectedArtifacts}
                intensity={intensity}
                onIntensityChange={setIntensity}
                isConnected={isConnected}
                isDataStreamOn={dataStreaming}
            />
        </div>
    );
}
