import { Handle, Position } from '@xyflow/react';
import {
    Card,
    CardHeader,
    CardContent,
    CardFooter,
} from '@/components/ui/card';

export default function SourceNode() {
    return (
        <Card>
            <Handle type="source" position={Position.Bottom} />
            <CardHeader></CardHeader>
            <CardContent>
                <p>Source</p>
            </CardContent>
            <CardFooter></CardFooter>
        </Card>
    );
}
