'use client';
import React from 'react';
import { Handle, Position, useReactFlow } from '@xyflow/react';
import { useGlobalContext } from '@/context/GlobalContext';
import WindowComboBox from './window-combo-box';
import useWebsocket from '@/hooks/useWebsocket';

interface WindowNodeProps {
    id?: string;
    // data?: any;
}

export default function WindowNode({ id }: WindowNodeProps) {
    const DEFAULT_WINDOW_SIZE = 64;
    const DEFAULT_OVERLAP_SIZE = 0;

    type WindowOption = 'default' | 'preset' | 'custom';

    const [windowSize, setWindowSize] = React.useState<number>(DEFAULT_WINDOW_SIZE);
    const [overlapSize, setOverlapSize] = React.useState<number>(DEFAULT_OVERLAP_SIZE);
    const [selectedOption, setSelectedOption] = React.useState<WindowOption>('default');

    const [isConnected, setIsConnected] = React.useState(false);
    
    // Get React Flow instance
    const reactFlowInstance = useReactFlow();
    
    // Get data stream status from global context
    const { dataStreaming } = useGlobalContext();

    const { sendProcessingConfig } = useWebsocket(0, 0)

    const buildConfig = () => {
        if (!isConnected) {
        return {
        chunk_size: DEFAULT_WINDOW_SIZE,
        overlap_size: DEFAULT_OVERLAP_SIZE,
        };
    }

    return {
        chunk_size: windowSize,
        overlap_size: overlapSize,
    };
};

    // Check connection status and update state
    const checkConnectionStatus = React.useCallback(() => {
        try {
            const edges = reactFlowInstance.getEdges();
            const nodes = reactFlowInstance.getNodes();
            
            // Check if this node is connected to source node or any activated node
            const isConnectedToActivatedNode = (nodeId: string, visited: Set<string> = new Set()): boolean => {
                if (visited.has(nodeId)) return false; // Prevent infinite loops
                visited.add(nodeId);
                
                // Find incoming edges to this node
                const incomingEdges = edges.filter(edge => edge.target === nodeId);
                
                for (const edge of incomingEdges) {
                    const sourceNode = nodes.find(n => n.id === edge.source);
                    if (!sourceNode) continue;
                    
                    // If source is a source-node, we're activated
                    if (sourceNode.type === 'source-node') {
                        return true;
                    }
                    
                    // If source is another node, check if it's activated
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
    
    const isValidConfig =
        Number.isInteger(windowSize) &&
        windowSize > 0 &&
        Number.isInteger(overlapSize) &&
        overlapSize >= 0 &&
        overlapSize < windowSize;

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
            window.removeEventListener('reactflow-edges-changed', handleEdgeChange);
            clearInterval(interval);
        };
    }, [checkConnectionStatus]);

    React.useEffect(() => {
        if (!dataStreaming) return;
        if(!isValidConfig) return;
        sendProcessingConfig(buildConfig());
    }, [windowSize, overlapSize, selectedOption, isConnected, dataStreaming])  

    return (
        <div className="relative">
            {/* Input Handle - positioned to align with left circle */}
            <Handle 
                type="target" 
                position={Position.Left}
                id="window-input"
                style={{ 
                    left: '24px',
                    top: '30px',
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
            
            {/* Output Handle - positioned to align with right circle */}
            <Handle 
                type="source" 
                position={Position.Right}
                id="window-output"
                style={{ 
                    right: '24px',
                    top: '30px',
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
            />
        </div>
    );
}