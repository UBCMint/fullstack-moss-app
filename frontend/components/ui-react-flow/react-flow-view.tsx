'use client';

import React, { useCallback } from 'react';
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
    ConnectionMode,
    Node,
    Edge,
    Connection,
    applyNodeChanges,
    OnNodesChange,
    applyEdgeChanges,
    OnEdgesChange,
    OnConnect,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import SourceNode from '@/components/nodes/source-node';
import FilterNode from '@/components/nodes/filter-node/filter-node';
import MachineLearningNode from '@/components/nodes/machine-learning-node/machine-learning-node';
import SignalGraphNode from '@/components/nodes/signal-graph-node/signal-graph-node';

import Sidebar from '@/components/ui-sidebar/sidebar';

import { useState } from 'react';
import { X } from 'lucide-react';
import { Ellipsis } from 'lucide-react';
import { headers } from 'next/headers';

const nodeTypes = {
    'source-node': SourceNode,
    'filter-node': FilterNode,
    'machine-learning-node': MachineLearningNode,
    'signal-graph-node': SignalGraphNode,
};

let id = 0;
const getId = () => `node_${id++}`;

const ReactFlowInterface = () => {
    const [nodes, setNodes] = useNodesState<Node>([]);
    const [edges, setEdges] = useEdgesState<Edge>([]);
    const { screenToFlowPosition } = useReactFlow();
    const [isControlsOpen, setIsControlsOpen] = useState(false);

    // Helper to notify components that edges have changed
    const dispatchEdgesChanged = () => {
        try {
            window.dispatchEvent(new Event('reactflow-edges-changed'));
        } catch (_) {
            // no-op if window is unavailable
        }
    };

    const onConnect: OnConnect = useCallback(
        (connection) => {
            // Validate new connections before adding the edge
            const sourceNode = nodes.find((n) => n.id === connection.source);
            const targetNode = nodes.find((n) => n.id === connection.target);

            // Disallow self-connections or missing nodes
            if (
                !connection.source ||
                !connection.target ||
                connection.source === connection.target ||
                !sourceNode ||
                !targetNode
            ) {
                return;
            }

            // Enforce: ML node must have a Filter as immediate predecessor
            if (targetNode.type === 'machine-learning-node') {
                if (sourceNode.type !== 'filter-node') {
                    // block Source → ML or anything else → ML
                    return;
                }
            }

            setEdges((eds) => {
                const updated = addEdge(connection, eds);
                return updated;
            });
            // dispatch immediately after scheduling state update
            dispatchEdgesChanged();
        },
        [nodes, setEdges]
    );

    const onNodesChange: OnNodesChange = useCallback(
        (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
        [setNodes]
    );

    const onEdgesChange: OnEdgesChange = useCallback(
        (changes) =>
            setEdges((eds) => {
                const updated = applyEdgeChanges(changes, eds);
                return updated;
            }),
        [setEdges]
    );

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

        const newNode = {
            id: getId(),
            type: nodeType,
            position,
            data: { label: `${nodeType}` },
        };

        console.log('🆕 Creating new node:', newNode);

        setNodes((nds) => {
            const updatedNodes = [...nds, newNode];
            console.log(
                '📋 Updated nodes list:',
                updatedNodes.map((n) => ({ id: n.id, type: n.type }))
            );
            return updatedNodes;
        });
    };

    const isValidConnection = useCallback(
        (connection: Connection | Edge) => {
            if (connection.source === connection.target) return false;
            const sourceNode = nodes.find((n) => n.id === connection.source);
            const targetNode = nodes.find((n) => n.id === connection.target);
            if (!sourceNode || !targetNode) return false;

            // Enforce: ML node requires Filter as immediate predecessor
            if (targetNode.type === 'machine-learning-node') {
                return sourceNode.type === 'filter-node';
            }

            // Allow Source → Filter; block Source → ML handled above
            if (targetNode.type === 'filter-node') {
                return sourceNode.type === 'source-node';
            }

            return true;
        },
        [nodes]
    );

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
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onDrop={onDrop}
                onDragOver={onDragOver}
                connectionMode={ConnectionMode.Strict}
                fitView
                style={{ backgroundColor: '#F7F9FB' }}
                nodeTypes={nodeTypes}
                snapToGrid={false}
                snapGrid={[15, 15]}
                defaultViewport={{ x: 0, y: 0, zoom: 1 }}
                minZoom={0.5}
                maxZoom={2}
                attributionPosition="bottom-left"
                isValidConnection={isValidConnection}
            >
                <Panel position="top-right" style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                }}>
                    <button
                        onClick={toggleControls}
                        className="p-1 rounded-full bg-white border "
                        style={{ 
                            width: 30, 
                            height: 30, 
                        }}
                    >
                        {isControlsOpen ? (
                            <X size={20} />
                        ) : (
                            <Ellipsis size={20} />
                        )}
                    </button>
                    <div style={{
                        transition: 'opacity 0.2s, transform 0.2s',
                        opacity: isControlsOpen ? 1 : 0,
                        transform: isControlsOpen ? 'translateY(5px)' : 'translateY(-5px)',
                        pointerEvents: isControlsOpen ? 'auto' : 'none',
                    }}>
                        <Controls
                            style={{
                                position: 'static',
                            }}
                        />
                    </div>
                </Panel>
                <Panel position="top-left">
                    <Sidebar />
                </Panel>

                {/* Debug Panel */}
                <Panel position="bottom-right">
                    <div className="bg-white p-2 rounded border text-xs">
                        <div>Nodes: {nodes.length}</div>
                        <div>Edges: {edges.length}</div>
                        <div className="mt-1 max-w-[260px]">
                            {edges.map((e) => (
                                <div key={e.id || `${e.source}-${e.target}`}>{`${e.source} → ${e.target}`}</div>
                            ))}
                        </div>
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
