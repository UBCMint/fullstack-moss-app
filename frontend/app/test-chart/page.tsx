'use client';
import { useState, useMemo } from 'react';
import SignalGraphView from '@/components/nodes/signal-graph-node/signal-graph-full';
import { GlobalProvider } from '@/context/GlobalContext';

const WINDOW_SIZE = 200; // how many points visible at once

export default function TestChartPage() {
  const [allData, setAllData] = useState<any[]>([]);
  const [windowStart, setWindowStart] = useState(0);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.trim().split('\n');
      const parsed = lines.slice(1).map(line => {
        const values = line.split(',');
        const timeOnly = values[0].trim().split(' ')[1]?.slice(0, 12) ?? values[0];
        return {
          time: timeOnly,
          signal1: Number(values[1]),
          signal2: Number(values[2]),
          signal3: Number(values[3]),
          signal4: Number(values[4]),
        };
      });
      setAllData(parsed);
      setWindowStart(0);
    };
    reader.readAsText(file);
  };

  // only the visible slice
  const visibleData = useMemo(
    () => allData.slice(windowStart, windowStart + WINDOW_SIZE),
    [allData, windowStart]
  );

  const maxStart = Math.max(0, allData.length - WINDOW_SIZE);

  return (
    <GlobalProvider>
      <div className="w-screen h-screen p-8" style={{ backgroundColor: '#EAF1F0' }}>
        
        <input type="file" accept=".csv" onChange={handleFile} className="mb-4" />
        
        {allData.length > 0 && (
          <div className="mb-4 flex items-center gap-4">
            <span className="text-sm text-gray-500">
              {allData.length} rows — showing {windowStart + 1}–{Math.min(windowStart + WINDOW_SIZE, allData.length)}
            </span>
            <input
              type="range"
              min={0}
              max={maxStart}
              value={windowStart}
              onChange={(e) => setWindowStart(Number(e.target.value))}
              className="w-full"
            />
          </div>
        )}

        {allData.length > 0 && <SignalGraphView data={visibleData} />}
      </div>
    </GlobalProvider>
  );
}