'use client';
import { useGlobalContext } from '@/context/GlobalContext';
import { ProcessingConfig } from '@/lib/processing';

const dispatchProcessingConfig = (config: ProcessingConfig) => {
    window.dispatchEvent(new CustomEvent('processing-config-update', { detail: config }));
};
import { Handle, Position, useReactFlow } from '@xyflow/react';
import React from 'react';
import ComboBox from './combo-box';

interface FilterNodeProps {
    id?: string;
    // data?: any;
}

export default function FilterNode({ id }: FilterNodeProps) {
    const [selectedFilter, setSelectedFilter] = React.useState('lowpass');
    const [isConnected, setIsConnected] = React.useState(false);
    const [lowCutoff, setLowCutoff] = React.useState(1)
    const [highCutoff, setHighCutoff] = React.useState(50)
    
    // Get React Flow instance
    const reactFlowInstance = useReactFlow();
    
    const { dataStreaming } = useGlobalContext();

    const buildConfig = (): ProcessingConfig => {
        if (!isConnected) {
          return {
            apply_bandpass: false,
            use_iir: false,
            l_freq: null,
            h_freq: null,
            downsample_factor: null,
            sfreq: 256,
            n_channels: 4,
          }
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
            }
      
          case 'highpass':
            return {
              apply_bandpass: true,
              use_iir: false,
              l_freq: lowCutoff,
              h_freq: null,
              downsample_factor: null,
              sfreq: 256,
              n_channels: 4,
            }
      
          case 'bandpass':
            return {
              apply_bandpass: true,
              use_iir: false,
              l_freq: lowCutoff,
              h_freq: highCutoff,
              downsample_factor: null,
              sfreq: 256,
              n_channels: 4,
            }

            default:
                throw new Error(`Unhandled filter type: ${selectedFilter}`)
        }
      }       

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

    React.useEffect(() => {
        if (!dataStreaming) return
        dispatchProcessingConfig(buildConfig())
    }, [selectedFilter, lowCutoff, highCutoff, isConnected, dataStreaming])  

    React.useEffect(() => {
        dispatchProcessingConfig(buildConfig());
    }, []);
    
    return (
        <div className="relative">
            {/* Input Handle - positioned to align with left circle */}
            <Handle 
                type="target" 
                position={Position.Left}
                id="filter-input"
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
                id="filter-output"
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
            <ComboBox 
                value={selectedFilter}
                onValueChange={setSelectedFilter}
                lowCutoff={lowCutoff}
                highCutoff={highCutoff}
                setLowCutoff={setLowCutoff}
                setHighCutoff={setHighCutoff}
                isConnected={isConnected}
                isDataStreamOn={dataStreaming}
            />

        </div>
    );
}