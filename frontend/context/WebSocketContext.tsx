'use client';

import React, {
    createContext,
    useContext,
    useEffect,
    useRef,
    useCallback,
    useState,
    ReactNode,
} from 'react';
import { useGlobalContext } from './GlobalContext';
import { PipelinePayload } from '@/lib/pipeline';
import {
    formatTimestamp,
    isStreamMetadataMessage,
    type ChannelLayout,
    type DataPoint,
} from '@/lib/channels';

export type { DataPoint } from '@/lib/channels';

type Subscriber = (points: DataPoint[]) => void;

type WebSocketContextType = {
    subscribe: (fn: Subscriber) => () => void;
    startPipeline: (payload: PipelinePayload) => void;
    /**
     * Layout from the server's metadata message for the current (or last)
     * connection; null until the first one arrives.
     */
    channelLayout: ChannelLayout | null;
};

const WebSocketContext = createContext<WebSocketContextType | undefined>(
    undefined
);

// Channel-major batch: eeg[c][i] / emg[c][i] is channel c at timestamps[i].
interface WebSocketBatch {
    timestamps: unknown[];
    eeg?: unknown[][];
    emg?: unknown[][];
}

// Sample i of every channel. Non-numeric values become 0.
function sampleAt(channels: unknown[][] | undefined, i: number): number[] {
    return (channels ?? []).map((channel) => Number(channel[i]) || 0);
}

function normalizeBatch(batch: WebSocketBatch): DataPoint[] {
    return batch.timestamps.map((time: unknown, i: number) => ({
        time: formatTimestamp(time),
        rawTime: String(time),
        eeg: sampleAt(batch.eeg, i),
        emg: sampleAt(batch.emg, i),
    }));
}

export function WebSocketProvider({ children }: { children: ReactNode }) {
    const { dataStreaming, setDataStreaming, activeSessionId } =
        useGlobalContext();
    const wsRef = useRef<WebSocket | null>(null);
    const pipelinePayloadRef = useRef<PipelinePayload | null>(null);
    const subscribersRef = useRef<Set<Subscriber>>(new Set());
    const closingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isClosingGracefullyRef = useRef(false);
    const [channelLayout, setChannelLayout] = useState<ChannelLayout | null>(
        null
    );

    const subscribe = useCallback((fn: Subscriber) => {
        subscribersRef.current.add(fn);
        return () => subscribersRef.current.delete(fn);
    }, []);

    // The caller supplies a freshly validated snapshot before opening the socket.
    const startPipeline = useCallback(
        (payload: PipelinePayload) => {
            pipelinePayloadRef.current = payload;
            setDataStreaming(true);
        },
        [setDataStreaming]
    );

    // Manage WebSocket lifecycle
    useEffect(() => {
        if (!dataStreaming) {
            pipelinePayloadRef.current = null;
            if (
                wsRef.current?.readyState === WebSocket.OPEN &&
                !isClosingGracefullyRef.current
            ) {
                isClosingGracefullyRef.current = true;
                wsRef.current.send('clientClosing');
                closingTimeoutRef.current = setTimeout(() => {
                    console.warn(
                        'Timeout: no confirmed closing received. Forcing close.'
                    );
                    wsRef.current?.close();
                    isClosingGracefullyRef.current = false;
                }, 5000);
            }
            return;
        }

        if (!activeSessionId) return;
        if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED)
            return;

        console.log('Opening WebSocket connection...');
        const ws = new WebSocket('ws://localhost:8080');
        wsRef.current = ws;

        ws.onopen = () => {
            console.log('WebSocket connection opened.');
            if (pipelinePayloadRef.current) {
                ws.send(JSON.stringify(pipelinePayloadRef.current));
                console.log(
                    'Sent pipeline payload on open:',
                    pipelinePayloadRef.current
                );
            }
        };

        ws.onmessage = (event) => {
            const message = event.data;
            if (message === 'confirmed closing') {
                console.log("Received 'confirmed closing' from server.");
                if (closingTimeoutRef.current)
                    clearTimeout(closingTimeoutRef.current);
                ws.close();
                isClosingGracefullyRef.current = false;
            } else {
                try {
                    const parsed = JSON.parse(message);
                    // The server sends the channel layout once, before any batch
                    if (isStreamMetadataMessage(parsed)) {
                        setChannelLayout(parsed.channels);
                        return;
                    }
                    const points = normalizeBatch(parsed);
                    subscribersRef.current.forEach((fn) => fn(points));
                } catch (e) {
                    console.error('Failed to parse WebSocket message:', e);
                }
            }
        };

        ws.onclose = (event) => {
            console.log(
                'WebSocket connection closed:',
                event.code,
                event.reason
            );
            wsRef.current = null;
            isClosingGracefullyRef.current = false;
        };

        ws.onerror = () => {
            if (closingTimeoutRef.current)
                clearTimeout(closingTimeoutRef.current);
            isClosingGracefullyRef.current = false;
        };

        return () => {
            if (closingTimeoutRef.current)
                clearTimeout(closingTimeoutRef.current);
            if (
                ws.readyState === WebSocket.OPEN &&
                !isClosingGracefullyRef.current
            ) {
                ws.send('clientClosing');
                closingTimeoutRef.current = setTimeout(() => ws.close(), 5000);
            } else if (ws.readyState !== WebSocket.CLOSED) {
                ws.close();
            }
            wsRef.current = null;
        };
    }, [dataStreaming, activeSessionId]);

    return (
        <WebSocketContext.Provider
            value={{ subscribe, startPipeline, channelLayout }}
        >
            {children}
        </WebSocketContext.Provider>
    );
}

export function useWebSocketContext() {
    const ctx = useContext(WebSocketContext);
    if (!ctx)
        throw new Error(
            'useWebSocketContext must be used within a WebSocketProvider'
        );
    return ctx;
}
