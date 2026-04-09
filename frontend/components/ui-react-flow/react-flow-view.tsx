'use client';

import React, { useCallback } from 'react';
import {
    ReactFlow,
    ReactFlowProvider,
    addEdge,
    useNodesState,
    useEdgesState,
    Controls,
    ControlButton,
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
import ArtifactNode from '@/components/nodes/artifact-node/artifact-node';
import FilterNode from '@/components/nodes/filter-node/filter-node';
import MachineLearningNode from '@/components/nodes/machine-learning-node/machine-learning-node';
import SignalGraphNode from '@/components/nodes/signal-graph-node/signal-graph-node';
import WindowNode from '@/components/nodes/window-node/window-node';

import Sidebar from '@/components/ui-sidebar/sidebar';
import {
    FrontendWorkspaceState,
    isFrontendWorkspaceState,
} from '@/lib/frontend-state';

import { useEffect, useState } from 'react';
import { X, Ellipsis, RotateCw, RotateCcw, LockKeyhole } from 'lucide-react';
import { Alert, AlertDescription } from '../ui/alert';

const nodeTypes = {
    'source-node': SourceNode,
    'artifact-node': ArtifactNode,
    'filter-node': FilterNode,
    'machine-learning-node': MachineLearningNode,
    'signal-graph-node': SignalGraphNode,
    'window-node': WindowNode,
};

let id = 0;
const getId = () => `node_${id++}`;

const ReactFlowInterface = () => {
    const [nodes, setNodes] = useNodesState<Node>([]);
    const [edges, setEdges] = useEdgesState<Edge>([]);
    const { screenToFlowPosition } = useReactFlow();
    const [isControlsOpen, setIsControlsOpen] = useState(false);
    const [open, setOpen] = useState(true);
    const [showPipelineWarning, setShowPipelineWarning] = useState(false);

    // Auto-dismiss pipeline warning after 30 seconds
    useEffect(() => {
        if (showPipelineWarning) {
            const timer = setTimeout(() => setShowPipelineWarning(false), 30000);
            return () => clearTimeout(timer);
        }
    }, [showPipelineWarning]);

    // Listen for global pipeline reset to clear nodes/edges
    useEffect(() => {
        const listener = () => {
            try {
                setNodes([]);
                setEdges([]);
            } catch (_) {
                // no-op
            }
        };
        window.addEventListener('pipeline-reset', listener);
        return () => window.removeEventListener('pipeline-reset', listener);
    }, [setNodes, setEdges]);

    useEffect(() => {
        const exportListener = () => {
            const state: FrontendWorkspaceState = {
                nodes,
                edges,
            };

            window.dispatchEvent(
                new CustomEvent('frontend-state-response', {
                    detail: state,
                })
            );
        };

        window.addEventListener('request-frontend-state', exportListener);
        return () =>
            window.removeEventListener('request-frontend-state', exportListener);
    }, [nodes, edges]);

    useEffect(() => {
        const importListener = (event: Event) => {
            const customEvent = event as CustomEvent<unknown>;
            if (!isFrontendWorkspaceState(customEvent.detail)) {
                return;
            }

            const importedState = customEvent.detail;
            setNodes(importedState.nodes);
            setEdges(importedState.edges);

            // Keep generated IDs unique after loading nodes with node_{n} IDs.
            const maxNodeIndex = importedState.nodes.reduce((max, node) => {
                const match = /^node_(\d+)$/.exec(node.id);
                if (!match) {
                    return max;
                }
                return Math.max(max, Number(match[1]));
            }, -1);
            id = Math.max(id, maxNodeIndex + 1);
        };

        window.addEventListener('restore-frontend-state', importListener);
        return () =>
            window.removeEventListener('restore-frontend-state', importListener);
    }, [setNodes, setEdges]);

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
        (changes) => {
            setNodes((nds) => applyNodeChanges(changes, nds));
            window.dispatchEvent(new Event('canvas-changed'));
        },
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

        if (!nodeType) return;

        if (nodeType === 'source-node') {
            const existingSource = nodes.find((n) => n.type === 'source-node');
            if (existingSource) {
                setShowPipelineWarning(true);
                return;
            }
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

            // Allow Source -> Artifact
            if (targetNode.type === 'artifact-node') {
                return sourceNode.type === 'source-node';
            }

            // Allow Source → Filter or Artifact → Filter
            if (targetNode.type === 'filter-node') {
                return sourceNode.type === 'source-node' || sourceNode.type === 'artifact-node';
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
                {open && (
                    <div className="flex justify-center items-center absolute top-24 left-1/2 transform -translate-x-1/2 z-10">
                        <Alert className="w-[288px] bg-[#FFFFFF] text-black flex justify-between items-start p-3 font-ibmplex border border-black">
                            <AlertDescription className="flex-1">
                                <div className="flex items-center gap-5">
                                    <LockKeyhole className='h-3.5 w-3.5 flex-shrink-0'/>
                                    <h3 className="font-bold text-sm">Data Storage & Privacy</h3>
                                </div>
                                <p className='text-[0.75rem] mt-1 ml-8'>Your data stays on your device and is never uploaded to the cloud.</p>
                            </AlertDescription>
                            <button onClick={() => setOpen(false)} className="ml-2">
                                <X className="h-3 w-3" />
                            </button>
                        </Alert>
                    </div>
                )}
                {showPipelineWarning && (
                    <div className="flex justify-center items-center absolute top-3 left-1/2 transform -translate-x-1/2 z-10">
                        <Alert className="w-[300px] bg-[#FFF4E1] text-black flex justify-between items-start p-3 font-ibmplex border-2 border-[#F0E4CA]">
                            <AlertDescription className="text-[0.75rem] text-center w-full">
                                Only one pipeline can be active at a time.
                            </AlertDescription>
                            <button onClick={() => setShowPipelineWarning(false)} className="ml-2">
                                <X className="h-3 w-3" />
                            </button>
                        </Alert>
                    </div>
                )}
                <Panel position="top-right" style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                }}>
                    <button
                        onClick={toggleControls}
                        className="p-1 rounded-full bg-white border"
                        style={{ 
                            width: 30, 
                            height: 30,
                            border: '1px solid #ebebeb',
                    }}>
                        {isControlsOpen ? (
                            <X size={20} />
                        ) : (
                            <Ellipsis size={20}/>
                        )}
                    </button>
                    <div style={{
                        transition: 'opacity 0.2s, transform 0.2s',
                        opacity: isControlsOpen ? 1 : 0,
                        transform: isControlsOpen ? 'translateY(5px)' : 'translateY(-5px)',
                        pointerEvents: isControlsOpen ? 'auto' : 'none',
                    }}>
                        <Controls showFitView={false} showInteractive={false} style={{
                            position: 'static',
                            boxShadow: '0 1px 1px rgba(255, 255, 255, 0)',
                            border: '1px solid #ebebeb',
                        }}>
                            <ControlButton>                                
                                <RotateCw strokeWidth={2.5} style={{fill: 'none'}}/>
                            </ControlButton>
                            <ControlButton>           
                                <RotateCcw strokeWidth={2.5} style={{fill: 'none'}}/>
                            </ControlButton>
                        </Controls>
                    </div>
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
