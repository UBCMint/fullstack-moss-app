'use client';

import React from 'react';
import { Handle, Position, useReactFlow } from '@xyflow/react';
import { useGlobalContext } from '@/context/GlobalContext';
import ComboBox, { LabelColor } from './label-combo-box';
import { TimelineLabelRow } from './label-timeline-panel';

interface LabelNodeProps {
    id?: string;
}

type LabelType = 'event-based';

interface LabeledMoment {
    id: string;
    label: string;
    color: LabelColor;
    labelType: LabelType;
    startTimestamp: string;
    endTimestamp: string;
    source: 'Trigger';
}

const EEG_DATA_POST_ENDPOINT =
    process.env.NEXT_PUBLIC_EEGDATA_POST_URL ??
    'http://127.0.0.1:9000/api/eeg-data';

export default function LabelNode({ id }: LabelNodeProps) {
    const [isConnected, setIsConnected] = React.useState(false);
    const [isTriggerActive, setIsTriggerActive] = React.useState(false);
    const [isExpanded, setIsExpanded] = React.useState(false);
    const [isLabelPopupOpen, setIsLabelPopupOpen] = React.useState(false);
    const [labelInputValue, setLabelInputValue] = React.useState('');
    const [selectedColor, setSelectedColor] = React.useState<LabelColor>('teal-700');
    const [sessionStartTimestamp, setSessionStartTimestamp] = React.useState<string | null>(null);
    const [latestBackendTimestamp, setLatestBackendTimestamp] = React.useState<
        string | null
    >(null);
    const [activeStartTimestamp, setActiveStartTimestamp] = React.useState<
        string | null
    >(null);
    const [pendingEndTimestamp, setPendingEndTimestamp] = React.useState<string | null>(null);
    const [labeledMoments, setLabeledMoments] = React.useState<LabeledMoment[]>([]);
    const labelsRef = React.useRef<LabeledMoment[]>([]);
    const previousStreamStateRef = React.useRef(false);
    const momentCounterRef = React.useRef(0);

    const { dataStreaming } = useGlobalContext();

    const reactFlowInstance = useReactFlow();
    const labelType: LabelType = 'event-based';

    // same as other nodes, copied from filter-node.tsx
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

    // Check connection status on mount and when edges might change - also from filter-node.tsx
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

    // TODO: this isn't working rn, start of ?
    React.useEffect(() => {
        labelsRef.current = labeledMoments;
    }, [labeledMoments]);

    React.useEffect(() => {
        const handlePacket = (event: Event) => {
            const customEvent = event as CustomEvent<{ latestTimestamp?: string | null }>;
            //const nextTimestamp = customEvent.detail?.latestTimestamp;
            // TODO: add current timestamp without using backend
            const nextTimestamp = new Date().toISOString();
            if (nextTimestamp) {
                if (!sessionStartTimestamp) {
                    setSessionStartTimestamp(nextTimestamp);
                }
                setLatestBackendTimestamp(nextTimestamp);
            }
        };

        window.addEventListener('eeg-data-packet', handlePacket as EventListener);
        return () => {
            window.removeEventListener('eeg-data-packet', handlePacket as EventListener);
        };
    }, [sessionStartTimestamp]);

    // currently not working
    const postLabelsToApi = React.useCallback(async () => {
        const labelsToPost = labelsRef.current;
        if (labelsToPost.length === 0) {
            return;
        }

        const payload = {
            labelType,
            labels: labelsToPost,
        };

        console.log('POST EEGData requested to:', EEG_DATA_POST_ENDPOINT, payload);
        try {
            const response = await fetch(EEG_DATA_POST_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });
            console.log('POST EEGData response status:', response.status);

            if (response.ok) {
                setLabeledMoments([]);
            }
        } catch (error) {
            console.error('POST EEGData request failed:', error);
        }
    }, [labelType]);

    React.useEffect(() => {
        const handleWebSocketClosed = () => {
            void postLabelsToApi();
        };

        window.addEventListener('eeg-websocket-disconnected', handleWebSocketClosed);
        return () => {
            window.removeEventListener('eeg-websocket-disconnected', handleWebSocketClosed);
        };
    }, [postLabelsToApi]);

    React.useEffect(() => {
        const wasStreaming = previousStreamStateRef.current;
        const streamJustStarted = !wasStreaming && dataStreaming;
        const streamJustStopped = wasStreaming && !dataStreaming;

        if (streamJustStarted) {
            setSessionStartTimestamp(null); // TODO huh
            setLatestBackendTimestamp(null);
        }

        if (streamJustStopped) {
            if (isTriggerActive) {
                setIsTriggerActive(false);
                setActiveStartTimestamp(null);
                setPendingEndTimestamp(null);
                setIsLabelPopupOpen(false);
                setLabelInputValue('');
            }
            void postLabelsToApi();
        }

        previousStreamStateRef.current = dataStreaming;
    }, [dataStreaming, isTriggerActive, postLabelsToApi]);

    const handleTriggerClick = () => {
        if (!dataStreaming) {
            console.warn('Cannot label while data stream is stopped.');
            return;
        }

        if (!isTriggerActive) {
            if (!latestBackendTimestamp) {
                console.warn('No backend EEG timestamp available yet for label start.');
                return;
            }

            setActiveStartTimestamp(latestBackendTimestamp);
            setPendingEndTimestamp(null);
            setIsTriggerActive(true);
            return;
        }

        if (!latestBackendTimestamp) {
            console.warn('No backend EEG timestamp available yet for label end.');
            return;
        }

        setPendingEndTimestamp(latestBackendTimestamp);
        setIsTriggerActive(false);
        setIsLabelPopupOpen(true);
    };

    const handleCloseLabelPopup = () => {
        setIsLabelPopupOpen(false);
        setLabelInputValue('');
        setActiveStartTimestamp(null);
        setPendingEndTimestamp(null);
        setIsTriggerActive(false);
    };

    const handleConfirmLabel = () => {
        if (!activeStartTimestamp || !pendingEndTimestamp) {
            console.warn('Missing backend timestamps for labeled moment.');
            return;
        }

        momentCounterRef.current += 1;

        const newLabeledMoment: LabeledMoment = {
            id: `moment-${momentCounterRef.current}`,
            label: labelInputValue.trim() || 'Untitled',
            color: selectedColor,
            labelType,
            startTimestamp: activeStartTimestamp,
            endTimestamp: pendingEndTimestamp,
            source: 'Trigger',
        };

        setLabeledMoments((prev) => [...prev, newLabeledMoment]);
        setIsLabelPopupOpen(false);
        setLabelInputValue('');
        setActiveStartTimestamp(null);
        setPendingEndTimestamp(null);
    };

    const handlePreviewOpen = () => {
        setIsExpanded(true);
    };

    const handleExpandedClose = () => {
        setIsExpanded(false);
    };

    const handleGraphViewClick = () => {
        console.log('clicked graph view');
    };

    const timelineRows = React.useMemo<TimelineLabelRow[]>(() => {
        const completedRows: TimelineLabelRow[] = labeledMoments.map((moment) => ({
            id: moment.id,
            label: moment.label,
            color: moment.color,
            startTimestamp: moment.startTimestamp,
            endTimestamp: moment.endTimestamp,
            source: moment.source,
            isInProgress: false,
        }));

        if (isTriggerActive && activeStartTimestamp) {
            completedRows.push({
                id: 'active-label-row',
                label: labelInputValue.trim() || 'Untitled',
                color: selectedColor,
                startTimestamp: activeStartTimestamp,
                endTimestamp: null,
                source: 'Trigger',
                isInProgress: true,
            });
        }

        return completedRows;
    }, [activeStartTimestamp, isTriggerActive, labelInputValue, labeledMoments, selectedColor]);

    return (
        <div className="relative">
            {/* Input Handle - positioned to align with left circle */}
            <Handle
                type="target"
                position={Position.Left}
                id="labeling-input"
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
                    pointerEvents: 'all',
                }}
            />

            {/* Output Handle - positioned to align with right circle */}
            <Handle
                type="source"
                position={Position.Right}
                id="labeling-output"
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
                    pointerEvents: 'all',
                }}
            />

            <ComboBox 
                isConnected={isConnected}
                isDataStreamOn={dataStreaming}
                isTriggerActive={isTriggerActive}
                onTriggerClick={handleTriggerClick}
                onPreviewOpen={handlePreviewOpen}
                isExpanded={isExpanded}
                onExpandedClose={handleExpandedClose}
                onGraphViewClick={handleGraphViewClick}
                isLabelPopupOpen={isLabelPopupOpen}
                labelInputValue={labelInputValue}
                selectedColor={selectedColor}
                onLabelInputChange={setLabelInputValue}
                onColorSelect={setSelectedColor}
                onConfirmLabel={handleConfirmLabel}
                onCloseLabelPopup={handleCloseLabelPopup}
                timelineRows={timelineRows}
                sessionStartTimestamp={sessionStartTimestamp}
                latestBackendTimestamp={latestBackendTimestamp}
            />
        </div>
    );
}
