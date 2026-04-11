'use client';

import React from 'react';
import { Handle, Position, useReactFlow } from '@xyflow/react';
import { useGlobalContext } from '@/context/GlobalContext';
import useNodeData from '@/hooks/useNodeData';
import ComboBox, { LabelColor } from './label-combo-box';
import { LabelGraphPoint, TimelineLabelRow } from '@/components/nodes/label-node/label-timeline-panel';
import { saveTimeLabels, createSession, getEegData } from '@/lib/session-api';

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


function normalizeNodeTimestamp(raw: unknown): string | null {
    if (raw == null) return null;

    if (typeof raw === 'number' && Number.isFinite(raw)) {
        const epochMs = raw < 1_000_000_000_000 ? raw * 1000 : raw;
        return new Date(epochMs).toISOString();
    }

    const value = String(raw).trim();
    if (!value) return null;

    if (/^\d+$/.test(value)) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return null;
        const epochMs = value.length <= 10 ? numeric * 1000 : numeric;
        return new Date(epochMs).toISOString();
    }

    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
        return new Date(parsed).toISOString();
    }

    const timeOnlyMatch = value.match(
        /^(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/
    );
    if (!timeOnlyMatch) return null;

    const hours = Number(timeOnlyMatch[1]);
    const minutes = Number(timeOnlyMatch[2]);
    const seconds = Number(timeOnlyMatch[3]);
    const milliseconds = Number(
        (timeOnlyMatch[4] ?? '0').padEnd(3, '0').slice(0, 3)
    );

    const date = new Date();
    date.setHours(hours, minutes, seconds, milliseconds);
    return date.toISOString();
}

export default function LabelNode({ id }: LabelNodeProps) {
    const [isConnected, setIsConnected] = React.useState(false);
    const [isTriggerActive, setIsTriggerActive] = React.useState(false);
    const [isExpanded, setIsExpanded] = React.useState(false);
    const [viewMode, setViewMode] = React.useState<'timeline' | 'graph'>(
        'timeline'
    );
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
    const { renderData } = useNodeData(300, 15);

    const [sessionIdSentToBackend, setSessionIdSentToBackend] = React.useState<number | null>(null);

    const reactFlowInstance = useReactFlow();

    React.useEffect(() => {
        // when the thing is connected for the first time, send the session id to the backend
        if (sessionIdSentToBackend !== null) {
            return;
        }
        if (isConnected) {
            void createSession(`Label Session ${new Date().toISOString()}`).then((session) => {
                setSessionIdSentToBackend(session.id);
            });
        }
    }, [isConnected]);

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
        if (!dataStreaming || renderData.length === 0) {
            return;
        }

        const mostRecentPoint = renderData[renderData.length - 1];
        const timestamp = normalizeNodeTimestamp(mostRecentPoint.time);

        if (!timestamp) {
            return;
        }

        setSessionStartTimestamp((previousValue) => previousValue ?? timestamp);
        setLatestBackendTimestamp(timestamp);
    }, [dataStreaming, renderData]);

    const postLabelsToApi = React.useCallback(async () => {
        if (sessionIdSentToBackend === null) {
            console.error('No session id — cannot post labels');
            return;
        }

        const unsentLabels = labelsRef.current.filter(
            (moment) => !sentLabelIdsRef.current.has(moment.id)
        );

        if (unsentLabels.length === 0) {
            return;
        }

        const payload = unsentLabels.map((moment) => ({
            start_timestamp: moment.startTimestamp,
            end_timestamp: moment.endTimestamp,
            label: moment.label,
            color: moment.color,
        }));

        try {
            await saveTimeLabels(sessionIdSentToBackend, payload);
            unsentLabels.forEach((moment) => sentLabelIdsRef.current.add(moment.id));
            console.log('POST time labels success:', payload);
        } catch (e) {
            console.error('Failed to POST time labels:', e);
        }
    }, [sessionIdSentToBackend]);

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
        setViewMode('timeline');
    };

    const handleExpandedClose = () => {
        setIsExpanded(false);
        setViewMode('timeline');
    };

    const handleGraphViewClick = () => {
        setViewMode('graph');
    };

    const handleTimelineViewClick = () => {
        setViewMode('timeline');
    };

    const handleFetchLabelData = React.useCallback(async (start: string, end: string): Promise<LabelGraphPoint[]> => {
        if (sessionIdSentToBackend === null) return [];
        try {
            const rows = await getEegData(sessionIdSentToBackend, start, end);
            return rows.map((row, index) => ({
                id: `fetched-${index}`,
                time: row.time,
                signal1: row.channel1,
                signal2: row.channel2,
                signal3: row.channel3,
                signal4: row.channel4,
            }));
        } catch {
            return [];
        }
    }, [sessionIdSentToBackend]);

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

    const graphData = React.useMemo<LabelGraphPoint[]>(() => {
        return renderData
            .map((item, index: number) => {
                return {
                    id: `graph-point-${index}`,
                    time: item.time,
                    signal1: Number(item.signal1 ?? 0),
                    signal2: Number(item.signal2 ?? 0),
                    signal3: Number(item.signal3 ?? 0),
                    signal4: Number(item.signal4 ?? 0),
                };
            })
            .slice(-300);
    }, [renderData]);

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
                onTimelineViewClick={handleTimelineViewClick}
                viewMode={viewMode}
                isLabelPopupOpen={isLabelPopupOpen}
                labelInputValue={labelInputValue}
                selectedColor={selectedColor}
                onLabelInputChange={setLabelInputValue}
                onColorSelect={setSelectedColor}
                onConfirmLabel={handleConfirmLabel}
                onCloseLabelPopup={handleCloseLabelPopup}
                timelineRows={timelineRows}
                graphData={graphData}
                sessionStartTimestamp={sessionStartTimestamp}
                latestBackendTimestamp={latestBackendTimestamp}
                fetchDataForLabel={handleFetchLabelData}
            />
        </div>
    );
}