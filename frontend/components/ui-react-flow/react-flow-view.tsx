'use client';

import React from 'react';
import {
    ReactFlow,
    ReactFlowProvider,
    addEdge,
    useNodesState,
    useEdgesState,
    Controls,
    useReactFlow,
    Background,
    Panel,
    Connection,
    ConnectionMode,
    Node,
    Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import SourceNode from '@/components/nodes/source-node';
import FilterNode from '@/components/nodes/filter-node/filter-node';
import MachineLearningNode from '@/components/nodes/machine-learning-node/machine-learning-node';
import SignalGraphNode from '@/components/nodes/signal-graph-node/signal-graph-node';

import Sidebar from '@/components/ui-sidebar/sidebar';

import { useState, useCallback } from "react";
import { X } from 'lucide-react';
import { Ellipsis } from 'lucide-react';

const nodeTypes = {
    'source-node': SourceNode,
    'filter-node': FilterNode,
    'machine-learning-node': MachineLearningNode,
    'signal-graph-node': SignalGraphNode,
};

let id = 0;
const getId = () => `node_${id++}`;

const ReactFlowInterface = () => {
    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
    const { screenToFlowPosition } = useReactFlow();
    const [isControlsOpen, setIsControlsOpen] = useState(false);

    // Simplified onConnect - connection is working, reduce logging
    const onConnect = useCallback((params: Connection) => {
        console.log('🔗 CONNECTION SUCCESS:', params.source, '→', params.target);
        
        setEdges((eds) => {
            const newEdges = addEdge(params, eds);
            console.log('✅ Edge added. Total edges:', newEdges.length);
            return newEdges;
        });
    }, [setEdges]);

    // Simplified change handlers - reduce console spam
    const handleEdgesChange = useCallback((changes: any) => {
        onEdgesChange(changes);
    }, [onEdgesChange]);

    const handleNodesChange = useCallback((changes: any) => {
        onNodesChange(changes);
    }, [onNodesChange]);

    const onDragOver = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    };

    const toggleControls = () => {
        setIsControlsOpen((prev) => !prev);
    };

    const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();

        const nodeType = event.dataTransfer.getData('application/reactflow');
        console.log('🎯 Dropped nodeType:', nodeType);

        if (!nodeType) {
            return;
        }

        const position = screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
        });

        const newNodeId = getId();
        const newNode = {
            id: newNodeId,
            type: nodeType,
            position,
            data: { label: `${nodeType}` },
        };

        console.log('🆕 Creating new node:', newNode);

        setNodes((nds) => {
            const updatedNodes = [...nds, newNode];
            console.log('📋 Updated nodes list:', updatedNodes.map(n => ({ id: n.id, type: n.type })));
            return updatedNodes;
        });
    };

    // Simplified connection validation
    const isValidConnection = useCallback((connection: Connection) => {
        // Basic validation only
        return connection.source !== connection.target;
    }, []);

    // Removed excessive state logging - only when needed
    // React.useEffect(() => {
    //     console.log('🔄 React Flow State Update:');
    //     console.log('Nodes count:', nodes.length);
    //     console.log('Edges count:', edges.length);
    // }, [nodes, edges]);

    return (
        <div
            style={{
                width: '100vw',
                height: '100vh',
                position: 'relative',
            }}
        >
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={handleNodesChange}
                onEdgesChange={handleEdgesChange}
                onConnect={onConnect}
                onDrop={onDrop}
                onDragOver={onDragOver}
                isValidConnection={isValidConnection}
                connectionMode={ConnectionMode.Loose} // More permissive connection mode
                fitView
                style={{ backgroundColor: '#F7F9FB' }}
                nodeTypes={nodeTypes}
                // Additional React Flow props for better connection handling
                snapToGrid={false}
                snapGrid={[15, 15]}
                defaultViewport={{ x: 0, y: 0, zoom: 1 }}
                minZoom={0.5}
                maxZoom={2}
                attributionPosition="bottom-left"
            >
                <Panel position="top-right">
                    <button
                        onClick={toggleControls}
                        className="p-2 rounded-full bg-white border "
                    >
                        {isControlsOpen ? <X size={20} /> : <Ellipsis size={20} />}
                    </button>
                    {isControlsOpen && (
                        <Controls position="top-right" style={{
                            top: '90%',
                            left: '-25%',
                        }} />
                    )}
                </Panel>
                <Panel position="top-left">
                    <Sidebar />
                </Panel>
                
                {/* Debug Panel */}
                <Panel position="bottom-right">
                    <div className="bg-white p-2 rounded border text-xs">
                        <div>Nodes: {nodes.length}</div>
                        <div>Edges: {edges.length}</div>
                    </div>
                </Panel>
                
                <Background />
            </ReactFlow>
        </div>
    );
};

export default function ReactFlowView() {
    return (
        <ReactFlowProvider>
            <ReactFlowInterface />
        </ReactFlowProvider>
    );
}