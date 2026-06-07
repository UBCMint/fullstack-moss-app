'use client';

import React, { createContext, useContext, useEffect, useRef, useCallback, ReactNode } from 'react';
import { useGlobalContext } from './GlobalContext';
import { PipelinePayload } from '@/lib/pipeline';

export type DataPoint = {
    time: string;
    rawTime: string;
    signal1: number;
    signal2: number;
    signal3: number;
    signal4: number;
};

type Subscriber = (points: DataPoint[]) => void;

type WebSocketContextType = {
    subscribe: (fn: Subscriber) => () => void;
    sendPipelinePayload: (payload: PipelinePayload) => void;
};

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

function formatTimestamp(raw: any): string {
    const s = String(raw);
    // ISO 8601 with T: "2026-03-11T03:55:22.715574979Z"
    if (s.includes('T')) return s.slice(11, 23);
    // Space-separated: "2025-07-17 21:13:42.408185+00"
    const spaceIdx = s.indexOf(' ');
    if (spaceIdx !== -1) return s.slice(spaceIdx + 1, spaceIdx + 13);
    return s;
}

function normalizeBatch(batch: any): DataPoint[] {
    return batch.timestamps.map((time: any, i: number) => ({
        time: formatTimestamp(time),
        rawTime: String(time),
        signal1: batch.signals[0][i],
        signal2: batch.signals[1][i],
        signal3: batch.signals[2][i],
        signal4: batch.signals[3][i],
    }));
}

export function WebSocketProvider({ children }: { children: ReactNode }) {
    const { dataStreaming, activeSessionId } = useGlobalContext();
    const wsRef = useRef<WebSocket | null>(null);
    const pipelinePayloadRef = useRef<PipelinePayload | null>(null);
    const subscribersRef = useRef<Set<Subscriber>>(new Set());
    const closingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isClosingGracefullyRef = useRef(false);

    const subscribe = useCallback((fn: Subscriber) => {
        subscribersRef.current.add(fn);
        return () => subscribersRef.current.delete(fn);
    }, []);

    const sendPipelinePayload = useCallback((payload: PipelinePayload) => {
        pipelinePayloadRef.current = payload;
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(payload));
            console.log('Sent pipeline payload:', payload);
        }
    }, []);

    // Manage WebSocket lifecycle
    useEffect(() => {
        if (!dataStreaming) {
            if (wsRef.current?.readyState === WebSocket.OPEN && !isClosingGracefullyRef.current) {
                isClosingGracefullyRef.current = true;
                wsRef.current.send('clientClosing');
                closingTimeoutRef.current = setTimeout(() => {
                    console.warn('Timeout: no confirmed closing received. Forcing close.');
                    wsRef.current?.close();
                    isClosingGracefullyRef.current = false;
                }, 5000);
            }
            return;
        }

        if (!activeSessionId) return;
        if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) return;

        console.log('Opening WebSocket connection...');
        const ws = new WebSocket('ws://localhost:8080');
        wsRef.current = ws;

        ws.onopen = () => {
            console.log('WebSocket connection opened.');
            if (pipelinePayloadRef.current) {
                ws.send(JSON.stringify(pipelinePayloadRef.current));
                console.log('Sent pipeline payload on open:', pipelinePayloadRef.current);
            }
        };

        ws.onmessage = (event) => {
            const message = event.data;
            if (message === 'confirmed closing') {
                console.log("Received 'confirmed closing' from server.");
                if (closingTimeoutRef.current) clearTimeout(closingTimeoutRef.current);
                ws.close();
                isClosingGracefullyRef.current = false;
            } else {
                try {
                    const points = normalizeBatch(JSON.parse(message));
                    subscribersRef.current.forEach((fn) => fn(points));
                } catch (e) {
                    console.error('Failed to parse WebSocket message:', e);
                }
            }
        };

        ws.onclose = (event) => {
            console.log('WebSocket connection closed:', event.code, event.reason);
            wsRef.current = null;
            isClosingGracefullyRef.current = false;
        };

        ws.onerror = () => {
            if (closingTimeoutRef.current) clearTimeout(closingTimeoutRef.current);
            isClosingGracefullyRef.current = false;
        };

        return () => {
            if (closingTimeoutRef.current) clearTimeout(closingTimeoutRef.current);
            if (ws.readyState === WebSocket.OPEN && !isClosingGracefullyRef.current) {
                ws.send('clientClosing');
                closingTimeoutRef.current = setTimeout(() => ws.close(), 5000);
            } else if (ws.readyState !== WebSocket.CLOSED) {
                ws.close();
            }
            wsRef.current = null;
        };
    }, [dataStreaming, activeSessionId]);

    return (
        <WebSocketContext.Provider value={{ subscribe, sendPipelinePayload }}>
            {children}
        </WebSocketContext.Provider>
    );
}

export function useWebSocketContext() {
    const ctx = useContext(WebSocketContext);
    if (!ctx) throw new Error('useWebSocketContext must be used within a WebSocketProvider');
    return ctx;
}
