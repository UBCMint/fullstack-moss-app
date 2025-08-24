import React from 'react';

interface ButtonProps {
    id: string;
    label: string;
    description: string;
}

const NodeButton = ({ id, label, description }: ButtonProps) => {
    const onDragStart = (
        event: React.DragEvent<HTMLDivElement>,
        nodeType: string
    ) => {
        event.dataTransfer.setData('application/reactflow', nodeType);
        event.dataTransfer.effectAllowed = 'move';
    };

    const isSourceNode = id === 'source-node';

    return (
        <div
            className="w-full"
            onDragStart={(event) => onDragStart(event, id)}
            draggable
        >
            <div className="w-full bg-white rounded-2xl border border-gray-300 px-3 py-2 flex items-center justify-between cursor-move">
                <div className="flex items-center">
                    {isSourceNode ? (
                        <div className="w-1.5 h-1.5 rounded-full bg-gray-300 mr-2" />
                    ) : (
                        <>
                            <div className="w-3.5 h-3.5 rounded-full border-2 border-gray-300 bg-white mr-2" />
                            <div className="w-1.5 h-1.5 rounded-full bg-gray-300 mr-1.5" />
                        </>
                    )}

                    <div className="flex flex-col items-start text-left">
                        <span className="font-ibmplex font-semibold text-[16px] leading-6 text-black">{label}</span>
                        {isSourceNode && (
                            <span className="font-ibmplex text-black text-[10px] leading-3">{description}</span>
                        )}
                    </div>
                </div>

                <div className="w-3.5 h-3.5 rounded-full border-2 border-gray-300 bg-white" />
            </div>
        </div>
    );
};

export default NodeButton;