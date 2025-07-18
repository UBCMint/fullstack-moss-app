import DataTable from '@/components/ui-data-table/data-table';
import {
    LineChart,
    Line,
    CartesianGrid,
    ResponsiveContainer,
    XAxis,
    YAxis,
    Label,
} from 'recharts';
import { useGlobalContext } from '@/context/GlobalContext';
import { Dialog, DialogContent, DialogTrigger, DialogTitle } from '@/components/ui/dialog';
import { useState } from 'react';

interface SignalGraphViewProps {
    data: {
        time: string;
        signal1: number;
        signal2: number;
        signal3: number;
        signal4: number;
        signal5: number;
    }[];
    droppedOnCanvas?: boolean;
}

export default function SignalGraphView({ data, droppedOnCanvas }: SignalGraphViewProps) {
    const { dataStreaming } = useGlobalContext();
    const [open, setOpen] = useState(false);
    // Always show grid/axes by providing dummy data if needed
    const chartData = (!droppedOnCanvas || dataStreaming || (data && data.length > 0)) ? data : [{ time: 0, signal1: 0, signal2: 0, signal3: 0, signal4: 0, signal5: 0 }];
    return (
        <div className="flex flex-col w-full h-full items-center justify-center">
            <div className="flex-1 w-full flex items-center justify-center">
                <ResponsiveContainer width="95%" height={400}>
                    <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis
                            dataKey="time"
                            stroke="#111"
                            axisLine={{ stroke: '#111', strokeWidth: 3 }}
                            tickLine={false}
                            domain={[0, 90]}
                            type="number"
                            ticks={[0,10,20,30,40,50,60,70,80,90]}
                        />
                        <YAxis
                            domain={[0, 100]}
                            stroke="#111"
                            axisLine={{ stroke: '#111', strokeWidth: 3 }}
                            tickLine={false}
                            ticks={[0,10,20,30,40,50,60,70,80,90,100]}
                            interval={0}
                            tick={{ fontSize: 12 }}
                        />
                        {(chartData && chartData.length > 0) && <>
                        <Line
                            isAnimationActive={false}
                            dot={false}
                            type="monotone"
                            dataKey="signal1"
                            stroke="#8884d8"
                            name="Signal 1"
                        />
                        <Line
                            isAnimationActive={false}
                            dot={false}
                            type="monotone"
                            dataKey="signal2"
                            stroke="#82ca9d"
                            name="Signal 2"
                        />
                        <Line
                            isAnimationActive={false}
                            dot={false}
                            type="monotone"
                            dataKey="signal3"
                            stroke="#ffc658"
                            name="Signal 3"
                        />
                        <Line
                            isAnimationActive={false}
                            dot={false}
                            type="monotone"
                            dataKey="signal4"
                            stroke="#ff7300"
                            name="Signal 4"
                        />
                        <Line
                            isAnimationActive={false}
                            dot={false}
                            type="monotone"
                            dataKey="signal5"
                            stroke="#0088fe"
                            name="Signal 5"
                        />
                        </>}
                    </LineChart>
                </ResponsiveContainer>
            </div>
            <div className="mt-4 flex justify-center w-full">
                <Dialog open={open} onOpenChange={setOpen}>
                    <DialogTrigger asChild>
                        <button className="border rounded-md px-4 py-2 bg-white shadow text-black text-base font-medium flex items-center gap-2">
                            <span>Expand Chart View</span>
                        </button>
                    </DialogTrigger>
                    <DialogContent className="w-[90vw] h-[90vh] max-w-none max-h-none flex items-center justify-center">
                        <DialogTitle className="sr-only">Expanded Signal Graph</DialogTitle>
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                <XAxis
                                    dataKey="time"
                                    stroke="#111"
                                    axisLine={{ stroke: '#111', strokeWidth: 3 }}
                                    tickLine={false}
                                    domain={[0, 90]}
                                    type="number"
                                    ticks={[0,10,20,30,40,50,60,70,80,90]}
                                />
                                <YAxis
                                    domain={[0, 100]}
                                    stroke="#111"
                                    axisLine={{ stroke: '#111', strokeWidth: 3 }}
                                    tickLine={false}
                                    ticks={[0,10,20,30,40,50,60,70,80,90,100]}
                                    interval={0}
                                    tick={{ fontSize: 12 }}
                                />
                                {(chartData && chartData.length > 0) && <>
                                <Line
                                    isAnimationActive={false}
                                    dot={false}
                                    type="monotone"
                                    dataKey="signal1"
                                    stroke="#8884d8"
                                    name="Signal 1"
                                />
                                <Line
                                    isAnimationActive={false}
                                    dot={false}
                                    type="monotone"
                                    dataKey="signal2"
                                    stroke="#82ca9d"
                                    name="Signal 2"
                                />
                                <Line
                                    isAnimationActive={false}
                                    dot={false}
                                    type="monotone"
                                    dataKey="signal3"
                                    stroke="#ffc658"
                                    name="Signal 3"
                                />
                                <Line
                                    isAnimationActive={false}
                                    dot={false}
                                    type="monotone"
                                    dataKey="signal4"
                                    stroke="#ff7300"
                                    name="Signal 4"
                                />
                                <Line
                                    isAnimationActive={false}
                                    dot={false}
                                    type="monotone"
                                    dataKey="signal5"
                                    stroke="#0088fe"
                                    name="Signal 5"
                                />
                                </>}
                            </LineChart>
                        </ResponsiveContainer>
                    </DialogContent>
                </Dialog>
            </div>
            <div className="w-1/3 overflow-auto hidden">
                {/* DataTable hidden in compact view, only show in expanded if needed */}
                <DataTable data={data} />
            </div>
        </div>
    );
}
