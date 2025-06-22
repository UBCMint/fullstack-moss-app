import { useEffect, useState, useRef } from 'react';
import { useGlobalContext } from '@/context/GlobalContext';

export default function useWebsocket(
    chartSize: number,
    batchesPerSecond: number
) {
    const { dataStreaming } = useGlobalContext();
    const [renderData, setRenderData] = useState<any[] | []>([]); //  batch data here
    const bufferRef = useRef<any[]>([]); // all data here
    const intervalTime = 1000 / batchesPerSecond;

    useEffect(() => {
        console.log('data streaming:', dataStreaming);
        if (!dataStreaming) return;

        const ws = new WebSocket('ws://localhost:8080');

        ws.onmessage = (event) => {
            const parsedData = JSON.parse(event.data);
            bufferRef.current.push(parsedData);
        };

        const updateRenderData = () => {
            if (bufferRef.current.length > 0) {
                const nextBatch = bufferRef.current.splice(
                    0,
                    Math.min(bufferRef.current.length, chartSize)
                );
                setRenderData((prevData) =>
                    [...prevData, ...nextBatch].slice(-chartSize)
                );
            }
        };

        const intervalId = setInterval(updateRenderData, intervalTime);

        return () => {
            ws.close();
            clearInterval(intervalId);
        };
    }, [chartSize, batchesPerSecond, dataStreaming]); // re-run when either parameter changes

    return { renderData };
}
