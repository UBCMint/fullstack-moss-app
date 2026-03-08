'use client';

import React from 'react';
import { Handle, Position, useReactFlow } from '@xyflow/react';
import { useGlobalContext } from '@/context/GlobalContext';
import ComboBox, { LabelColor } from './label-combo-box';
import { TimelineLabelRow } from './label-timeline-panel';

interface LabelNodeProps {
    id?: string;
}

interface LabeledMoment {
    id: string;
    label: string;
    color: LabelColor;
    startTimestamp: string;
    endTimestamp: string;
    source: 'Trigger';
}

const API_BASE_URL =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:9000';
const LABEL_SESSION_ID = process.env.NEXT_PUBLIC_LABEL_SESSION_ID ?? '1';
const TIME_LABELS_ENDPOINT = `${API_BASE_URL}/api/sessions/${LABEL_SESSION_ID}/time-label`;

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
    const sentLabelIdsRef = React.useRef<Set<string>>(new Set());
    const previousStreamStateRef = React.useRef(false);
    const momentCounterRef = React.useRef(0);

    const { dataStreaming } = useGlobalContext();

    const reactFlowInstance = useReactFlow();

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

    React.useEffect(() => {
        checkConnectionStatus();
        
        const handleEdgeChange = () => {
            checkConnectionStatus();
        };
        
        window.addEventListener('reactflow-edges-changed', handleEdgeChange);
        
        const interval = setInterval(checkConnectionStatus, 1000);
        
        return () => {
            window.removeEventListener('reactflow-edges-changed', handleEdgeChange);
            clearInterval(interval);
        };
    }, [checkConnectionStatus]);

    React.useEffect(() => {
        labelsRef.current = labeledMoments;
    }, [labeledMoments]);

    React.useEffect(() => {
        if (!dataStreaming) {
            return;
        }

        const tick = () => {
            const timestamp = new Date().toISOString();
            setSessionStartTimestamp((previousValue) => previousValue ?? timestamp);
            setLatestBackendTimestamp(timestamp);
        };

        tick();
        const interval = setInterval(tick, 300);
        return () => clearInterval(interval);
    }, [dataStreaming]);

    const postLabelsToApi = React.useCallback(async () => {
        const unsentLabels = labelsRef.current.filter(
            (moment) => !sentLabelIdsRef.current.has(moment.id)
        );

        if (unsentLabels.length === 0) {
            return;
        }

        const payload = unsentLabels.map((moment) => ({
            timestamp: moment.startTimestamp, // will need start and end timestamps, backend update
            label: moment.label,
        }));

        console.log('POST time labels:', TIME_LABELS_ENDPOINT, payload);

        try {
            const response = await fetch(TIME_LABELS_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorBody = await response.text();
                console.error(
                    'POST time labels failed:',
                    response.status,
                    errorBody
                );
                return;
            }

            unsentLabels.forEach((moment) => {
                sentLabelIdsRef.current.add(moment.id);
            });
            console.log('POST time labels success:', unsentLabels.length);
        } catch (error) {
            console.error('POST time labels request error:', error);
        }
    }, []);

    React.useEffect(() => {
        const wasStreaming = previousStreamStateRef.current;
        const streamJustStopped = wasStreaming && !dataStreaming;

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
