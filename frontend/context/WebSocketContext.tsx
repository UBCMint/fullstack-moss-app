'use client';

import React, { createContext, useContext, useEffect, useRef, useCallback, ReactNode } from 'react';
import { useGlobalContext } from './GlobalContext';
import { ProcessingConfig, WindowingConfig } from '@/lib/processing';

export type DataPoint = {
    time: string;
    signal1: number;
    signal2: number;
    signal3: number;
    signal4: number;
};

type Subscriber = (points: DataPoint[]) => void;

type WebSocketContextType = {
    subscribe: (fn: Subscriber) => () => void;
    sendProcessingConfig: (config: ProcessingConfig) => void;
    sendWindowingConfig: (config: WindowingConfig) => void;
};

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

const DEFAULT_PROCESSING_CONFIG: ProcessingConfig = {
    apply_bandpass: false,
    use_iir: false,
    l_freq: null,
    h_freq: null,
    downsample_factor: null,
    sfreq: 256,
    n_channels: 4,
};

function formatTimestamp(raw: any): string {
    const s = String(raw);
    // ISO 8601: "2026-03-11T03:55:22.715574979Z" - extract "03:55:22"
    if (s.includes('T')) return s.slice(11, 19);
    return s;
}

function normalizeBatch(batch: any): DataPoint[] {
    return batch.timestamps.map((time: any, i: number) => ({
        time: formatTimestamp(time),
        signal1: batch.signals[0][i],
        signal2: batch.signals[1][i],
        signal3: batch.signals[2][i],
        signal4: batch.signals[3][i],
    }));
}

export function WebSocketProvider({ children }: { children: ReactNode }) {
    const { dataStreaming } = useGlobalContext();
    const wsRef = useRef<WebSocket | null>(null);
    const processingConfigRef = useRef<ProcessingConfig | null>(null);
    const windowingConfigRef = useRef<WindowingConfig | null>(null);
    const subscribersRef = useRef<Set<Subscriber>>(new Set());
    const closingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isClosingGracefullyRef = useRef(false);

    const subscribe = useCallback((fn: Subscriber) => {
        subscribersRef.current.add(fn);
        return () => subscribersRef.current.delete(fn);
    }, []);

    const sendProcessingConfig = useCallback((config: ProcessingConfig) => {
        processingConfigRef.current = config;
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(config));
            console.log('Sent processing config:', config);
        }
    }, []);

    const sendWindowingConfig = useCallback((config: WindowingConfig) => {
        windowingConfigRef.current = config;
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(config));
            console.log('Sent windowing config:', config);
        }
    }, []);

    // Forward config events from nodes to backend
    useEffect(() => {
        const processingHandler = (event: Event) => {
            sendProcessingConfig((event as CustomEvent<ProcessingConfig>).detail);
        };
        const windowingHandler = (event: Event) => {
            sendWindowingConfig((event as CustomEvent<WindowingConfig>).detail);
        };
        window.addEventListener('processing-config-update', processingHandler);
        window.addEventListener('windowing-config-update', windowingHandler);
        return () => {
            window.removeEventListener('processing-config-update', processingHandler);
            window.removeEventListener('windowing-config-update', windowingHandler);
        };
    }, [sendProcessingConfig, sendWindowingConfig]);

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

        if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) return;

        console.log('Opening WebSocket connection...');
        const ws = new WebSocket('ws://localhost:8080');
        wsRef.current = ws;

        ws.onopen = () => {
            console.log('WebSocket connection opened.');
            ws.send(JSON.stringify(processingConfigRef.current ?? DEFAULT_PROCESSING_CONFIG));
            if (windowingConfigRef.current) {
                ws.send(JSON.stringify(windowingConfigRef.current));
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
    }, [dataStreaming]);

    return (
        <WebSocketContext.Provider value={{ subscribe, sendProcessingConfig, sendWindowingConfig }}>
            {children}
        </WebSocketContext.Provider>
    );
}

export function useWebSocketContext() {
    const ctx = useContext(WebSocketContext);
    if (!ctx) throw new Error('useWebSocketContext must be used within a WebSocketProvider');
    return ctx;
}
