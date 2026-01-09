import { useEffect, useState, useRef } from 'react';
import { useGlobalContext } from '@/context/GlobalContext';
import { ProcessingConfig } from '@/lib/processing';

export default function useWebsocket(
    chartSize: number,
    batchesPerSecond: number
) {
    const { dataStreaming } = useGlobalContext();
    const [renderData, setRenderData] = useState<any[] | []>([]);
    const bufferRef = useRef<any[]>([]);
    const wsRef = useRef<WebSocket | null>(null);
    const closingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const [isClosingGracefully, setIsClosingGracefully] = useState(false);
    const processingConfigRef = useRef<ProcessingConfig | null>(null);

    const intervalTime = 1000 / batchesPerSecond;

    const sendProcessingConfig = (config: ProcessingConfig) => {
        processingConfigRef.current = config
      
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify(config))
          console.log('Sent processing config:', config)
        }
    }      

    useEffect(() => {
        console.log('data streaming:', dataStreaming);

        if (!dataStreaming && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            if (!isClosingGracefully) {
                console.log("Initiating graceful close...");
                setIsClosingGracefully(true);
                wsRef.current.send('clientClosing');

                closingTimeoutRef.current = setTimeout(() => {
                    console.warn("Timeout: No 'confirmed closing' received. Forcing WebSocket close.");
                    if (wsRef.current) {
                        wsRef.current.close();
                    }
                    setIsClosingGracefully(false);
                }, 5000);
            }
            return;
        }

        if (!dataStreaming && (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED)) {
            return;
        }

        if (dataStreaming && (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED)) {
            console.log("Opening new WebSocket connection...");
            const ws = new WebSocket('ws://localhost:8080');
            wsRef.current = ws;

            ws.onopen = () => {
                console.log('WebSocket connection opened.');

                if (processingConfigRef.current) {
                    ws.send(JSON.stringify(processingConfigRef.current))
                }
            };

            ws.onmessage = (event) => {
                const message = event.data;
                if (message === 'confirmed closing') {
                    console.log("Received 'confirmed closing' from server. Proceeding to close.");
                    if (closingTimeoutRef.current) {
                        clearTimeout(closingTimeoutRef.current);
                    }
                    if (wsRef.current) {
                        wsRef.current.close();
                    }
                    setIsClosingGracefully(false);
                } else {
                    try {
                        const parsedData = JSON.parse(message);
                        bufferRef.current.push(parsedData);
                    } catch (e) {
                        console.error("Failed to parse non-confirmation message as JSON:", e, message);
                    }
                }
            };

            ws.onclose = (event) => {
                console.log('WebSocket connection closed:', event.code, event.reason);
                wsRef.current = null;
                setIsClosingGracefully(false);
            };

            ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                if (closingTimeoutRef.current) {
                    clearTimeout(closingTimeoutRef.current);
                }
                setIsClosingGracefully(false);
            };
        }

        const updateRenderData = () => {
            if (bufferRef.current.length > 0) {
                const nextBatch = bufferRef.current.splice(
                    0,
                    Math.min(bufferRef.current.length, chartSize)
                );
                setRenderData((prevData) =>
                    [...(Array.isArray(prevData) ? prevData : []), ...nextBatch].slice(-chartSize)
                );
            }
        };

        let intervalId: NodeJS.Timeout | null = null;
        if (dataStreaming) {
            intervalId = setInterval(updateRenderData, intervalTime);
        }

        return () => {
            console.log("Cleanup function running.");
            if (intervalId) {
                clearInterval(intervalId);
            }

            if (closingTimeoutRef.current) {
                clearTimeout(closingTimeoutRef.current);
            }

            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && !isClosingGracefully) {
                console.log("Component unmounting or dependencies changed: Initiating graceful close during cleanup.");
                wsRef.current.send('clientClosing');
                closingTimeoutRef.current = setTimeout(() => {
                    console.warn("Timeout: No 'confirmed closing' received during cleanup. Forcing WebSocket close.");
                    if (wsRef.current) {
                        wsRef.current.close();
                    }
                }, 5000);
            } else if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
                console.log("Forcing immediate WebSocket close during cleanup.");
                wsRef.current.close();
            }
            wsRef.current = null;
            setIsClosingGracefully(false);
        };
    }, [chartSize, batchesPerSecond, dataStreaming, isClosingGracefully]);

    return { renderData, sendProcessingConfig };
}