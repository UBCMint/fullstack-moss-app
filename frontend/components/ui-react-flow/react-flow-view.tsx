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
<<<<<<< HEAD
import { X, Ellipsis, RotateCw, RotateCcw, LockKeyhole } from 'lucide-react';
import { Alert, AlertDescription } from '../ui/alert';
=======
import { X, Ellipsis, RotateCw, RotateCcw } from 'lucide-react';
import { useWebSocketContext } from '@/context/WebSocketContext';
import { PipelinePayload } from '@/lib/pipeline';
import { useGlobalContext } from '@/context/GlobalContext';
>>>>>>> 32f50af (Frontend websocket change to pipeline)

const nodeTypes = {
    'source-node': SourceNode,
    'filter-node': FilterNode,
    'machine-learning-node': MachineLearningNode,
    'signal-graph-node': SignalGraphNode,
    'window-node': WindowNode,
};

// defines backend types for React Flow types
const typeMap: Record<string, string> = {
  'source-node': 'source',
  'filter-node': 'preprocessing',
  'window-node': 'window',
  'machine-learning-node': 'ml',
};

// allow for defaults of the filtering node to still be applied if user doesn't specify them in the UI
const DEFAULT_PROCESSING = {
    apply_bandpass: false,
    use_iir: false,
    l_freq: null,
    h_freq: null,
    downsample_factor: null,
    sfreq: 256,
    n_channels: 4,
};
const DEFAULT_WINDOWING = {
    chunk_size: 64,
    overlap_size: 0,
};

const topoSort = (nodes: Node[], edges: Edge[]) => {
  const incoming = new Map<string, number>(); // count of incoming edges for each node
  const outgoing = new Map<string, string[]>(); // list of target nodes for each node

  // Initialize maps to 0 incoming and empty outgoing 
  nodes.forEach((n) => {
    incoming.set(n.id, 0);
    outgoing.set(n.id, []);
  });

  edges.forEach((e) => {
    if (!outgoing.has(e.source)) return; 
    outgoing.get(e.source)!.push(e.target); // Add target to outgoing list of source
    incoming.set(e.target, (incoming.get(e.target) ?? 0) + 1); // Increment incoming count for target
  });

  const queue = nodes
    .filter((n) => (incoming.get(n.id) ?? 0) === 0)
    .map((n) => n.id);

  const ordered: string[] = [];

  // Kahn's algorithm for topological sorting 
  while (queue.length > 0) {
    const id = queue.shift()!;
    ordered.push(id);

    for (const target of outgoing.get(id) ?? []) {
      const next = (incoming.get(target) ?? 0) - 1;
      incoming.set(target, next);
      if (next === 0) queue.push(target);
    }
  }

  // In case of cycles or disconnected nodes
  nodes.forEach((n) => {
    if (!ordered.includes(n.id)) ordered.push(n.id);
  });

  return ordered.map((id) => nodes.find((n) => n.id === id)!).filter(Boolean);
};

// Converts React Flow state to backend pipeline format
const buildPipelinePayload = (
  nodes: Node[],
  edges: Edge[],
  sessionId: string
): PipelinePayload => {
  const orderedNodes = topoSort(nodes, edges); // Ensure nodes are in execution order

  return {
    session_id: sessionId,
    nodes: orderedNodes.map((n) => {
      const type = typeMap[n.type ?? ''] ?? n.type ?? 'unknown'; // Map to backend type
      const config = (n.data as { config?: Record<string, any> })?.config ?? {}; 

      if(type == 'preprocessing') {
        return {type, config: {...DEFAULT_PROCESSING, ...config}}; //apply defaults if not specified by user
      }

      if(type == 'window') {
        return {type, config: {...DEFAULT_WINDOWING, ...config}};
      }

        return {type,config};
    }),
  };
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

    const { sendPipelinePayload } = useWebSocketContext(); 
    const {activeSessionId} = useGlobalContext(); 

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

    // Send updated pipeline to backend on any changes to nodes, edges, or active session
    useEffect(() => {
        if (nodes.length === 0) return;
        if(activeSessionId== null) return; //no session yet
        const payload = buildPipelinePayload(nodes, edges, String(activeSessionId));
        sendPipelinePayload(payload);
    }, [nodes, edges, activeSessionId, sendPipelinePayload]);

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
