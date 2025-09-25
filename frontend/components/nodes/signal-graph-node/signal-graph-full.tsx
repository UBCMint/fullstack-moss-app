import { useState } from 'react';
import DataTable from '@/components/ui-data-table/data-table';
import {
    LineChart,
    Line,
    CartesianGrid,
    ResponsiveContainer,
    XAxis,
    YAxis,
} from 'recharts';
import { useGlobalContext  } from '@/context/GlobalContext';
import { DivideCircle } from 'lucide-react';

interface SignalGraphViewProps {
    data: {
        time: string;
        signal1: number;
        signal2: number;
        signal3: number;
        signal4: number;
        signal5: number;
    }[];
}

export default function SignalGraphView({ data }: SignalGraphViewProps) {
    const { dataStreaming } = useGlobalContext();
    const [selectedSignal, setSelectedSignal] = useState<string | null>(null);

    // if stream is off, table clears and chart shows frozen data (if previously loaded)
    const displayedTableData = dataStreaming ? data : [];

    const signals = [
        {key: 'signal1', colour: '#0000ff', name: 'Signal 1'}, // change colours later
        {key: 'signal2', colour: '#00ff00', name: 'Signal 2'},
        {key: 'signal3', colour: '#FFC0CB', name: 'Signal 3'},
        {key: 'signal4', colour: '#FFFF00', name: 'Signal 4'},
        {key: 'signal5', colour: '#ff0000', name: 'Signal 5'},
    ];

    return (
        <div className="flex flex-col gap-6">
            {/* graph */}
            <div className="flex flex-col border bg-white shadow-md rounded-2xl p-6">
                <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={data.length > 0 ? data : []} syncId="SignalChart">
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis 
                            dataKey="time" 
                            type="number"
                            domain={[0,100]}
                            ticks={[0,10,20,30,40,50,60,70,80,90,100]}
                        />
                        <YAxis 
                            type="number"
                            domain={[0,100]}
                            ticks={[0,10,20,30,40,50,60,70,80,90,100]}
                        />
                        {signals.map((s) => (
                        <Line
                            key={s.key}
                            dataKey={s.key}
                            isAnimationActive={false}
                            dot={false}
                            type="monotone"
                            stroke={selectedSignal === null ? s.colour : (selectedSignal === s.key ? s.colour : '#C0C0C0')}
                            name={s.name}
                        />
                        ))}
                    </LineChart>
                </ResponsiveContainer>
                
                {/* metadata/signal selector */}
                <div className="flex gap-4 justify-center mt-2">
                {signals.map((s) => {
                    const isSelected = selectedSignal === s.key;
                    const anySelected = selectedSignal !== null;

                    return (
                    <button
                        key={s.key}
                        onClick={() =>
                        setSelectedSignal(isSelected ? null : s.key)
                        }
                        className="flex items-center gap-4 px-5 py-1 rounded transition"
                    >
                        {/* Color swatch */}
                        <span
                        className="w-7 h-0.5"
                        style={{
                            backgroundColor: anySelected ? (isSelected ? s.colour : '#C0C0C0') : s.colour,
                        }}
                        />
                        {/* Signal name */}
                        <span className={anySelected ? (isSelected ? 'text-black' : 'text-gray-400') : 'text-black'}>
                        {s.name}
                        </span>
                    </button>
                    );
                })}
                </div>
            </div>
            {/* Data Table */}
            <div className="bg-white border shadow-md rounded-2xl p-4 overflow-auto">
                <DataTable data={displayedTableData} />
            </div>
        </div>
    );
}
