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
            <span className="text-[#64748B] font-lg" style={{fontFamily: 'IBM Plex Sans, sans-serif',}}>{leftTime}</span>
            <span className="text-[#64748B]">|</span>
            <span className="text-[#64748B] font-lg" style={{fontFamily: 'IBM Plex Sans, sans-serif',}}>{rightTime}</span>
        </div>
    );
};
