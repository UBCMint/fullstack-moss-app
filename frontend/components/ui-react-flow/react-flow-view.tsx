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
import ResamplingNode from '@/components/nodes/resampling-node/resampling-node';
import SignalGraphNode from '@/components/nodes/signal-graph-node/signal-graph-node';
import WindowNode from '@/components/nodes/window-node/window-node';
import LabelNode from '@/components/nodes/label-node/label-node';

import Sidebar from '@/components/ui-sidebar/sidebar';
import {
    FrontendWorkspaceState,
    isFrontendWorkspaceState,
} from '@/lib/frontend-state';

import { useEffect, useState } from 'react';
import { X, Ellipsis, RotateCw, RotateCcw, LockKeyhole } from 'lucide-react';
import { Alert, AlertDescription } from '../ui/alert';
import { useWebSocketContext } from '@/context/WebSocketContext';
import { preparePipelineStart } from '@/lib/pipeline-validation';
import { useNotifications } from '@/components/notifications';
import { useGlobalContext } from '@/context/GlobalContext';

const nodeTypes = {
    'source-node': SourceNode,
    'artifact-node': ArtifactNode,
    'filter-node': FilterNode,
    'resampling-node': ResamplingNode,
    'machine-learning-node': MachineLearningNode,
    'signal-graph-node': SignalGraphNode,
    'window-node': WindowNode,
    'label-node': LabelNode,
};

let id = 0;
const getId = () => `node_${id++}`;

const ReactFlowInterface = () => {
    const [nodes, setNodes] = useNodesState<Node>([]);
    const [edges, setEdges] = useEdgesState<Edge>([]);
    const { screenToFlowPosition, getNodes, getEdges } = useReactFlow();
    const [isControlsOpen, setIsControlsOpen] = useState(false);

    const [open, setOpen] = useState(true);
    const [showPipelineWarning, setShowPipelineWarning] = useState(false);
    const [pipelineWarning, setPipelineWarning] = useState('');

    // Auto-dismiss pipeline warning after 30 seconds
    useEffect(() => {
        if (showPipelineWarning) {
            const timer = setTimeout(
                () => setShowPipelineWarning(false),
                30000
            );
            return () => clearTimeout(timer);
        }
    }, [showPipelineWarning]);

    const { startPipeline } = useWebSocketContext();
    const { activeSessionId, dataStreaming } = useGlobalContext();
    const notifications = useNotifications();

    // Listen for global pipeline reset to clear nodes/edges
    useEffect(() => {
        const listener = () => {
            try {
                setNodes([]);
                setEdges([]);
            } catch {
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
            window.removeEventListener(
                'request-frontend-state',
                exportListener
            );
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
            window.removeEventListener(
                'restore-frontend-state',
                importListener
            );
    }, [setNodes, setEdges]);

    // Helper to notify components that edges have changed
    const dispatchEdgesChanged = () => {
        try {
            window.dispatchEvent(new Event('reactflow-edges-changed'));
        } catch {
            // no-op if window is unavailable
        }
    };

    const onConnect: OnConnect = useCallback(
        (connection) => {
            // The backend uses the graph configured at Start; stop before adding edges.
            if (dataStreaming) return;
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
        [nodes, setEdges, dataStreaming]
    );

    // Keep draft editing separate from execution: incomplete boards are normal while
    // editing. This effect only registers a Start listener; validation and payload
    // creation happen inside that listener when either Start button dispatches the event.
    useEffect(() => {
        const start = () => {
            // Ignore another Start request while a stream is already active.
            if (dataStreaming) return;
            // Read the board at click time rather than capturing nodes/edges from
            // a previous render or reusing the last valid board's payload.
            const currentNodes = getNodes();
            const currentEdges = getEdges();
            const { errors, warnings, payload } = preparePipelineStart(
                currentNodes,
                currentEdges,
                activeSessionId
            );
            // Invalid boards (or a missing session) must not open a WebSocket.
            if (!payload) {
                notifications.error({
                    title: 'Complete your pipeline before starting',
                    description: errors.join(' '),
                });
                return;
            }
            setPipelineWarning(warnings.join(' '));
            setShowPipelineWarning(warnings.length > 0);
            // Store the validated configuration before enabling the socket lifecycle.
            startPipeline(payload);
        };
        // Header and chart Start buttons share this canvas-owned validation path.
        window.addEventListener('pipeline-start', start);
        // React calls this cleanup before replacing the effect and on unmount.
        // Remove the old listener to avoid duplicate calls and stale captured values;
        // this does not clear the board, chart samples, or recorded session data.
        return () => window.removeEventListener('pipeline-start', start);
        // Re-register when a captured value/function changes so the listener stays
        // current. Getter dependencies track function identity, not board contents:
        // editing nodes/edges does not itself invoke Start or run validation.
    }, [
        getNodes,
        getEdges,
        activeSessionId,
        dataStreaming,
        notifications,
        startPipeline,
    ]);

    const onNodesChange: OnNodesChange = useCallback(
        (changes) => {
            // During streaming, allow selection, dragging, and layout measurement,
            // but reject structural changes such as adding/removing/replacing nodes.
            // Positions are display-only and do not change the backend payload.
            setNodes((nds) =>
                applyNodeChanges(
                    dataStreaming
                        ? changes.filter(
                              (change) =>
                                  change.type === 'select' ||
                                  change.type === 'position' ||
                                  change.type === 'dimensions'
                          )
                        : changes,
                    nds
                )
            );
            window.dispatchEvent(new Event('canvas-changed'));
        },
        [setNodes, dataStreaming]
    );

    const onEdgesChange: OnEdgesChange = useCallback(
        (changes) =>
            setEdges((eds) => {
                // Edges may be selected while streaming, but their structure must
                // stay unchanged until Stop (including removal via change events).
                const updated = applyEdgeChanges(
                    dataStreaming
                        ? changes.filter((change) => change.type === 'select')
                        : changes,
                    eds
                );
                return updated;
            }),
        [setEdges, dataStreaming]
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
        // Sidebar drops add new nodes; only moving existing nodes is allowed live.
        if (dataStreaming) return;

        const nodeType = event.dataTransfer.getData('application/reactflow');

        if (!nodeType) return;

        if (nodeType === 'source-node') {
            const existingSource = nodes.find((n) => n.type === 'source-node');
            if (existingSource) {
                setPipelineWarning('Only one Source node is allowed.');
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
            // Reject connection attempts during streaming as well as guarding onConnect.
            if (dataStreaming) return false;
            if (connection.source === connection.target) return false;
            const sourceNode = nodes.find((n) => n.id === connection.source);
            const targetNode = nodes.find((n) => n.id === connection.target);
            if (!sourceNode || !targetNode) return false;

            // Source must be the first node: block any incoming edge into Source
            if (targetNode.type === 'source-node') {
                return false;
            }

            // Block if source node already has an outgoing edge (Source can have only one)
            if (sourceNode.type === 'source-node') {
                const hasOutgoing = edges.some(
                    (e) => e.source === sourceNode.id
                );
                if (hasOutgoing) return false;
            }

            // Block window node not directly connecting to source
            if (targetNode.type === 'window-node') {
                return sourceNode.type === 'source-node';
            }

            // Output nodes are terminal: block any outgoing edge from them
            if (
                sourceNode.type === 'machine-learning-node' ||
                sourceNode.type === 'signal-graph-node'
            ) {
                return false;
            }

            return true;
        },
        [nodes, edges, dataStreaming]
    );

    return (
        <div
            style={{
                width: '100%',
                height: '100%',
                position: 'relative',
            }}
        >
            {/* Keep dragging available, but disable connection edits and keyboard
                deletion during streaming. Handler guards above also enforce this. */}
            <ReactFlow
                nodesDraggable
                nodesConnectable={!dataStreaming}
                edgesReconnectable={!dataStreaming}
                deleteKeyCode={dataStreaming ? null : ['Backspace', 'Delete']}
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
                {/* Explain the editing restrictions only while they are active. */}
                {dataStreaming && (
                    <Panel position="bottom-center">
                        <p
                            role="status"
                            className="rounded border bg-white px-4 py-2 text-sm"
                        >
                            Stop the data stream to edit the pipeline.
                        </p>
                    </Panel>
                )}
                {open && (
                    <div className="flex justify-center items-center absolute top-24 left-1/2 transform -translate-x-1/2 z-10">
                        <Alert className="w-[288px] bg-[#FFFFFF] text-black flex justify-between items-start p-3 font-ibmplex border border-black">
                            <AlertDescription className="flex-1">
                                <div className="flex items-center gap-5">
                                    <LockKeyhole className="h-3.5 w-3.5 flex-shrink-0" />
                                    <h3 className="font-bold text-sm">
                                        Data Storage & Privacy
                                    </h3>
                                </div>
                                <p className="text-[0.75rem] mt-1 ml-8">
                                    Your data stays on your device and is never
                                    uploaded to the cloud.
                                </p>
                            </AlertDescription>
                            <button
                                onClick={() => setOpen(false)}
                                className="ml-2"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </Alert>
                    </div>
                )}
                {showPipelineWarning && (
                    <div className="flex justify-center items-center absolute top-3 left-1/2 transform -translate-x-1/2 z-10">
                        <Alert className="w-[300px] bg-[#FFF4E1] text-black flex justify-between items-start p-3 font-ibmplex border-2 border-[#F0E4CA]">
                            <AlertDescription className="text-[0.75rem] text-center w-full">
                                {pipelineWarning}
                            </AlertDescription>
                            <button
                                onClick={() => setShowPipelineWarning(false)}
                                className="ml-2"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </Alert>
                    </div>
                )}
                <Panel
                    position="top-right"
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                    }}
                >
                    <button
                        onClick={toggleControls}
                        className="p-1 rounded-full bg-white border"
                        style={{
                            width: 30,
                            height: 30,
                            border: '1px solid #ebebeb',
                        }}
                    >
                        {isControlsOpen ? (
                            <X size={20} />
                        ) : (
                            <Ellipsis size={20} />
                        )}
                    </button>
                    <div
                        style={{
                            transition: 'opacity 0.2s, transform 0.2s',
                            opacity: isControlsOpen ? 1 : 0,
                            transform: isControlsOpen
                                ? 'translateY(5px)'
                                : 'translateY(-5px)',
                            pointerEvents: isControlsOpen ? 'auto' : 'none',
                        }}
                    >
                        <Controls
                            showFitView={false}
                            showInteractive={false}
                            style={{
                                position: 'static',
                                boxShadow: '0 1px 1px rgba(255, 255, 255, 0)',
                                border: '1px solid #ebebeb',
                            }}
                        >
                            <ControlButton>
                                <RotateCw
                                    strokeWidth={2.5}
                                    style={{ fill: 'none' }}
                                />
                            </ControlButton>
                            <ControlButton>
                                <RotateCcw
                                    strokeWidth={2.5}
                                    style={{ fill: 'none' }}
                                />
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
