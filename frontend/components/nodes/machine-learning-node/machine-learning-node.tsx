'use client';
import React from 'react';
import { Handle, Position, useReactFlow } from '@xyflow/react';
import { useGlobalContext } from '@/context/GlobalContext';
import MLComboBox from './ml-combo-box';

interface MachineLearningNodeProps {
    id?: string;
    data?: any;
}

export default function MachineLearningNode({ id, data }: MachineLearningNodeProps) {
    const [selectedPrediction, setSelectedPrediction] = React.useState('stress');
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

    return (
        <div className="relative">
            {/* Input Handle - positioned to align with left circle */}
            <Handle 
                type="target" 
                position={Position.Left}
                id="ml-input"
                style={{ 
                    left: '20px', // Align with left circle position
                    top: '30px',
                    transform: 'translateY(-50%)',
                    width: '16px',
                    height: '16px',
                    backgroundColor: 'transparent',
                    border: '2px solid transparent',
                    borderRadius: '50%',
                    zIndex: 10
                }}
                className="hover:border-blue-500"
            />
            
            {/* Output Handle - positioned to align with right circle */}
            <Handle 
                type="source" 
                position={Position.Right}
                id="ml-output"
                style={{ 
                    right: '20px', // Align with right circle position
                    top: '30px',
                    transform: 'translateY(-50%)',
                    width: '16px',
                    height: '16px',
                    backgroundColor: 'transparent',
                    border: '2px solid transparent',
                    borderRadius: '50%',
                    zIndex: 10
                }}
                className="hover:border-blue-500"
            />

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