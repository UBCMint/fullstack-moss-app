'use client';

import React, {
    createContext,
    useContext,
    useEffect,
    useRef,
    useCallback,
    ReactNode,
} from 'react';
import { useGlobalContext } from './GlobalContext';
import {
    isPipelineServerError,
    PipelinePayload,
    QualityReport,
} from '@/lib/pipeline';

export type DataPoint = {
    time: string;
    rawTime: string;
    signal1: number;
    signal2: number;
    signal3: number;
    signal4: number;
};

type Subscriber = (points: DataPoint[]) => void;
type QualitySubscriber = (reports: QualityReport[]) => void;

type WebSocketContextType = {
    subscribe: (fn: Subscriber) => () => void;
    /** Quality reports from each batch, one per Signal Quality node. */
    subscribeQuality: (fn: QualitySubscriber) => () => void;
    startPipeline: (payload: PipelinePayload) => void;
};

const WebSocketContext = createContext<WebSocketContextType | undefined>(
    undefined
);

function formatTimestamp(raw: unknown): string {
    const s = String(raw);
    // ISO 8601 with T: "2026-03-11T03:55:22.715574979Z"
    if (s.includes('T')) return s.slice(11, 23);
    // Space-separated: "2025-07-17 21:13:42.408185+00"
    const spaceIdx = s.indexOf(' ');
    if (spaceIdx !== -1) return s.slice(spaceIdx + 1, spaceIdx + 13);
    return s;
}

interface WebSocketBatch {
    timestamps: unknown[];
    signals: unknown[][];
    quality?: QualityReport[];
}

function normalizeBatch(batch: WebSocketBatch): DataPoint[] {
    return batch.timestamps.map((time: unknown, i: number) => ({
        time: formatTimestamp(time),
        rawTime: String(time),
        signal1: Number(batch.signals[0][i]) ?? 0,
        signal2: Number(batch.signals[1][i]) ?? 0,
        signal3: Number(batch.signals[2][i]) ?? 0,
        signal4: Number(batch.signals[3][i]) ?? 0,
    }));
}

export function WebSocketProvider({ children }: { children: ReactNode }) {
    const { dataStreaming, setDataStreaming, activeSessionId } =
        useGlobalContext();
    const wsRef = useRef<WebSocket | null>(null);
    const pipelinePayloadRef = useRef<PipelinePayload | null>(null);
    const subscribersRef = useRef<Set<Subscriber>>(new Set());
    const qualitySubscribersRef = useRef<Set<QualitySubscriber>>(new Set());
    const closingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isClosingGracefullyRef = useRef(false);

    const subscribe = useCallback((fn: Subscriber) => {
        subscribersRef.current.add(fn);
        return () => subscribersRef.current.delete(fn);
    }, []);

    const subscribeQuality = useCallback((fn: QualitySubscriber) => {
        qualitySubscribersRef.current.add(fn);
        return () => qualitySubscribersRef.current.delete(fn);
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
                let parsed: unknown;
                try {
                    parsed = JSON.parse(message);
                } catch (e) {
                    console.error('Failed to parse WebSocket message:', e);
                    return;
                }
                // pipeline rejected or stream failed; the canvas shows the message
                if (isPipelineServerError(parsed)) {
                    console.error('Pipeline error from server:', parsed);
                    window.dispatchEvent(
                        new CustomEvent('pipeline-error', { detail: parsed })
                    );
                    setDataStreaming(false);
                    return;
                }
                const batch = parsed as WebSocketBatch;
                const points = normalizeBatch(batch);
                subscribersRef.current.forEach((fn) => fn(points));
                if (batch.quality?.length) {
                    const reports = batch.quality;
                    qualitySubscribersRef.current.forEach((fn) => fn(reports));
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
    }, [dataStreaming, activeSessionId, setDataStreaming]);

    return (
        <WebSocketContext.Provider
            value={{ subscribe, subscribeQuality, startPipeline }}
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
