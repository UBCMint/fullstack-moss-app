import React from 'react';
import { Button } from '@/components/ui/button';
import {
    HoverCard,
    HoverCardContent,
    HoverCardTrigger,
} from '@/components/ui/hover-card';
import { InfoCircledIcon } from '@radix-ui/react-icons';
import DotGrid from '@/components/radix/dotgrid';

interface ButtonProps {
    id: string;
    label: string;
    description: string;
}

const InfoIcon = () => (
    <div className="w-3 h-3 rounded-full bg-black flex items-center justify-center cursor-pointer">
        <InfoCircledIcon className="w-6 h-6 text-white" />
    </div>
);

const NodeButton = ({ id, label, description }: ButtonProps) => {
    const onDragStart = (
        event: React.DragEvent<HTMLDivElement>,
        nodeType: string
    ) => {
        console.log('Dragging:', nodeType);
        event.dataTransfer.setData('application/reactflow', nodeType);
        event.dataTransfer.effectAllowed = 'move';
    };

    return (
        <div
            className="w-full"
            onDragStart={(event) => onDragStart(event, id)}
            draggable
        >
            <Button variant="outline" className="w-full h-16 justify-between">
                <div className="flex items-center">
                    <DotGrid />
                    <span>{label}</span>
                </div>
                <div>
                    <HoverCard>
                        <HoverCardTrigger asChild>
                            <div className="flex items-center">
                                <InfoIcon />
                            </div>
                        </HoverCardTrigger>
                        <HoverCardContent
                            side="right"
                            align="center"
                            alignOffset={0}
                            className="relative p-3 max-w-sm drop-shadow-lg"
                            sideOffset={22}
                        >
                            <p className="text-sm text-muted-foreground whitespace-normal font-geist">
                                {description}
                            </p>
                        </HoverCardContent>
                    </HoverCard>
                </div>
            </Button>
        </div>
    );
};

export default NodeButton;
