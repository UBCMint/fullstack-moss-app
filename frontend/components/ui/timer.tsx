import React from 'react';

interface TimerProps {
    leftTime: string;
    rightTime: string;
    className?: string;
}

export const Timer: React.FC<TimerProps> = ({
    leftTime,
    rightTime,
    className = '',
}) => {
    return (
        <div
            className={`flex items-center space-x-2 font-mono text-xs ${className}`}
        >
            <span className="text-gray-700 font-medium">{leftTime}</span>
            <span className="text-gray-400">|</span>
            <span className="text-gray-700 font-medium">{rightTime}</span>
        </div>
    );
};
