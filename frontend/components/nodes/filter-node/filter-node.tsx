'use client';
import React from 'react';
import { Handle, Position } from '@xyflow/react';
import {
    Card,
    CardContent,
    CardFooter,
    CardHeader,
} from '@/components/ui/card';
import ComboBox from './combo-box';
import { Slider } from '@/components/ui/slider';
import { TypographyP } from '@/components/typography/typography';

export default function FilterNode() {
    const [freq, setFreq] = React.useState(0);

    const handleFreqChange = (value: number[]) => {
        setFreq(value[0]);
    };

    return (
        <Card>
            <Handle type="target" position={Position.Left} />
            <Handle type="source" position={Position.Right} />
            <CardHeader></CardHeader>
            <CardContent>
                <ComboBox />
            </CardContent>
            <CardFooter className="flex items-center justify-between">
                <Slider
                    value={[freq]}
                    max={100}
                    step={1}
                    onValueChange={handleFreqChange}
                />
                <TypographyP>{freq}hz</TypographyP>
            </CardFooter>
        </Card>
    );
}
