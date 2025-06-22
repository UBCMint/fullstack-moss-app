import { LineChart, Line, CartesianGrid, ResponsiveContainer } from 'recharts';

interface SignalGraphPreviewProps {
    data: {
        time: string;
        signal1: number;
        signal2: number;
        signal3: number;
        signal4: number;
        signal5: number;
    }[];
}

export default function SignalGraphPreview({ data }: SignalGraphPreviewProps) {
    return (
        <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
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
            </LineChart>
        </ResponsiveContainer>
    );
}
