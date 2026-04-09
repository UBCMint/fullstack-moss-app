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
import { X, Ellipsis, RotateCw, RotateCcw, LockKeyhole } from 'lucide-react';
import { Alert, AlertDescription } from '../ui/alert';
import { useWebSocketContext } from '@/context/WebSocketContext';
import { PipelinePayload } from '@/lib/pipeline';
import { useGlobalContext } from '@/context/GlobalContext';

const nodeTypes = {
    'source-node': SourceNode,
    'filter-node': FilterNode,
    'machine-learning-node': MachineLearningNode,
    'signal-graph-node': SignalGraphNode,
    'window-node': WindowNode,
};

// defines backend types for React Flow types
const typeMap: Record<string, string> = {
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

// Only these nodes are executed by the backend pipeline
const PIPELINE_NODE_TYPES = new Set([
    'window-node',
    'filter-node',
    'machine-learning-node',
]);

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

const validatePipeline = (nodes: Node[], edges: Edge[]) => {
  const errors: string[] = [];
  const warnings: string[] = [];

  // maps to track nodes and their connections
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();

  nodes.forEach((n) => {
    incoming.set(n.id, []);
    outgoing.set(n.id, []);
  });

  // Build connection maps
  edges.forEach((e) => {
    if (!incoming.has(e.target) || !outgoing.has(e.source)) return;
    incoming.get(e.target)!.push(e.source);
    outgoing.get(e.source)!.push(e.target);
  });

  // Require 1 source node
  const sourceNodes = nodes.filter((n) => n.type === 'source-node');
  if (sourceNodes.length === 0) errors.push('Missing Source node.');
  if (sourceNodes.length > 1) errors.push('Multiple Source nodes are not allowed.');

  // Require 1 window node
  const windowNodes = nodes.filter((n) => n.type === 'window-node');
  if (windowNodes.length === 0) errors.push('Missing Window node.');
  if (windowNodes.length > 1) errors.push('Multiple Window nodes are not allowed.');

  // Require window node must connect directly to source
  windowNodes.forEach((win) => {
    const ins = incoming.get(win.id) ?? [];
    if (ins.length === 0 || ins.some((id) => byId.get(id)?.type !== 'source-node')) {
      errors.push('Window node must connect directly from Source.');
    }
  });

  // If ML node exists, window is required for the ML pipeline
  const mlNodes = nodes.filter((n) => n.type === 'machine-learning-node');
  if (mlNodes.length > 0 && windowNodes.length === 0) {
    errors.push('A Window node is required for ML pipelines.');
  }

  // Require that output nodes are terminal
  const outputTypes = new Set(['signal-graph-node', 'machine-learning-node']);
  nodes.forEach((n) => {
    if (outputTypes.has(n.type ?? '')) {
      const outs = outgoing.get(n.id) ?? [];
      if (outs.length > 0) errors.push('Output nodes must be terminal.');
    }
  });

  // Require that ML node doesnt connect directly to source
  nodes
    .filter((n) => n.type === 'machine-learning-node')
    .forEach((ml) => {
      const ins = incoming.get(ml.id) ?? [];
      if (ins.some((id) => byId.get(id)?.type === 'source-node')) {
        errors.push('ML nodes cannot connect directly to Source.');
      }
    });

  // Warn if filter node appears before window when window exists
  const filterNodes = nodes.filter((n) => n.type === 'filter-node');
  const filterDirectFromSource = filterNodes.some((fn) => {
    const ins = incoming.get(fn.id) ?? [];
    return ins.some((id) => byId.get(id)?.type === 'source-node');
  });
  if (windowNodes.length > 0 && filterDirectFromSource) {
    warnings.push('Filter nodes should come after Window nodes when Window nodes are present.');
  }

  // Warn if output nodes are connected directly to Source while preprocessing exists
  const hasPreprocessing = filterNodes.length > 0 || windowNodes.length > 0;
  const outputDirectFromSource = nodes.some((n) => {
    if (!outputTypes.has(n.type ?? '')) return false;
    const ins = incoming.get(n.id) ?? [];
    return ins.some((id) => byId.get(id)?.type === 'source-node');
  });
  if (hasPreprocessing && outputDirectFromSource) {
    warnings.push('Outputs should come after preprocessing when preprocessing exists.');
  }

  // Cycle detection: if topoSort doesn't include all nodes
  const ordered = topoSort(nodes, edges);
  if (ordered.length !== nodes.length) {
    errors.push('Pipeline contains a cycle.');
  }

  return { errors, warnings };
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
    nodes: orderedNodes
      .filter((n) => PIPELINE_NODE_TYPES.has(n.type ?? ''))
      .map((n) => {
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

        // Validate pipeline before sending
        const { errors, warnings} = validatePipeline(nodes, edges);
        if (errors.length > 0) {
            console.error('Pipeline validation errors:', errors);
            return; // Don't send invalid pipeline
        }

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

            // Source must be the first node: block any incoming edge into Source
            if (targetNode.type === 'source-node') {
                return false;
            }

            // Block if source node already has an outgoing edge (Source can have only one)
            if (sourceNode.type === 'source-node') {
                const hasOutgoing = edges.some((e) => e.source === sourceNode.id);
                if (hasOutgoing) return false;
            }

            // Block window node not directly connecting to source
            if (targetNode.type === 'window-node') {
                return sourceNode.type === 'source-node';
            }

            // Output nodes are terminal: block any outgoing edge from them
            if (sourceNode.type === 'machine-learning-node' || sourceNode.type === 'signal-graph-node') {
                return false;
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
