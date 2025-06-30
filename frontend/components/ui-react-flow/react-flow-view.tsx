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
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import SourceNode from '@/components/nodes/source-node';
import FilterNode from '@/components/nodes/filter-node/filter-node';
import SignalGraphNode from '@/components/nodes/signal-graph-node/signal-graph-node';

import Sidebar from '@/components/ui-sidebar/sidebar';

import { useState } from "react";
import { X } from 'lucide-react';
import { Ellipsis } from 'lucide-react';

const nodeTypes = {
    'source-node': SourceNode,
    'filter-node': FilterNode,
    'signal-graph-node': SignalGraphNode,
};

let id = 0;
const getId = () => `node_${id++}`;

const ReactFlowInterface = () => {
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const { screenToFlowPosition } = useReactFlow();
    const [isControlsOpen, setIsControlsOpen] = useState(false);

    const onConnect = (params: Connection) => {
        setEdges((eds) => addEdge(params, eds));
    };

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
        console.log('Dropped nodeType:', nodeType);

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

        setNodes((nds) => [...nds, newNode]);
    };

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
                fitView
                style={{ backgroundColor: '#F7F9FB' }}
                nodeTypes={nodeTypes}
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
