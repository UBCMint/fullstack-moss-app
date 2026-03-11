import { useEffect, useRef, useState } from 'react';
import { useWebSocketContext, DataPoint } from '@/context/WebSocketContext';
import { useGlobalContext } from '@/context/GlobalContext';

export default function useNodeData(chartSize: number, batchesPerSecond: number) {
    const { subscribe } = useWebSocketContext();
    const { dataStreaming } = useGlobalContext();
    const [renderData, setRenderData] = useState<DataPoint[]>([]);
    const bufferRef = useRef<DataPoint[]>([]);

    // Subscribe to incoming data points from the shared WebSocket
    useEffect(() => {
        const unsubscribe = subscribe((points) => {
            bufferRef.current.push(...points);
        });
        return unsubscribe;
    }, [subscribe]);

    // Drain the buffer into renderData at the node's own rate
    useEffect(() => {
        if (!dataStreaming || batchesPerSecond <= 0) return;

        const intervalTime = 1000 / batchesPerSecond;
        const id = setInterval(() => {
            if (bufferRef.current.length > 0) {
                const batch = bufferRef.current.splice(
                    0,
                    Math.min(bufferRef.current.length, chartSize)
                );
                setRenderData((prev) => [...prev, ...batch].slice(-chartSize));
            }
        }, intervalTime);

        return () => clearInterval(id);
    }, [dataStreaming, batchesPerSecond, chartSize]);

    // Always clear the buffer on start/stop to prevent backlog buildup.
    // renderData is never cleared so the chart holds its last frame when paused
    // and new data naturally replaces it as it arrives.
    useEffect(() => {
        bufferRef.current = [];
    }, [dataStreaming]);

    return { renderData };
}
