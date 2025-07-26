'use client';
import React from 'react';
import { Handle, Position, useReactFlow } from '@xyflow/react';
import ComboBox from './combo-box';

interface FilterNodeProps {
    id?: string;
    data?: any;
}

export default function FilterNode({ id, data }: FilterNodeProps) {
    const [selectedFilter, setSelectedFilter] = React.useState('lowpass');
    const [isConnected, setIsConnected] = React.useState(false);
    
    // Get React Flow instance
    const reactFlowInstance = useReactFlow();
    
    // Check connection status and update state
    const checkConnectionStatus = React.useCallback(() => {
        try {
            const edges = reactFlowInstance.getEdges();
            const connected = edges.some(edge => edge.target === id);
            setIsConnected(connected);
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
                id="filter-input"
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
                id="filter-output"
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

            {/* Just the ComboBox without Card wrapper */}
            <ComboBox 
                value={selectedFilter}
                onValueChange={setSelectedFilter}
                isConnected={isConnected}
            />
        </div>
    );
}