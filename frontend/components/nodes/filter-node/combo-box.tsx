import * as React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

const filters = [
    {
        value: 'lowpass',
        label: 'Low Pass Filter',
    },
    {
        value: 'highpass',
        label: 'High Pass Filter',
    },
];

interface ComboBoxProps {
    value?: string;
    onValueChange?: (value: string) => void;
    isConnected?: boolean;
    isDataStreamOn?: boolean;
}

export default function ComboBox({ 
    value = 'lowpass', 
    onValueChange,
    isConnected = false,
    isDataStreamOn = false
}: ComboBoxProps) {
    const [isExpanded, setIsExpanded] = React.useState(false);
    const titleRef = React.useRef<HTMLSpanElement>(null);

    const toggleExpanded = () => {
        setIsExpanded(!isExpanded);
    };

    const handleOptionSelect = (optionValue: string) => {
        onValueChange?.(optionValue);
        // Add animation delay before closing
        setTimeout(() => {
            setIsExpanded(false);
        }, 100);
    };

    return (
        <div 
            className={cn(
                "bg-white rounded-3xl border-2 overflow-hidden",
                // Node border stays gray - no change with connection
                "border-[#D3D3D3]"
            )}
            style={{
                width: 'fit-content',
                minWidth: '280px',
                height: isExpanded ? 'auto' : '56px',
                transition: 'height 0.3s ease-in-out'
            }}
        >
            {/* Main button/header */}
            <button
                onClick={toggleExpanded}
                className="w-full h-14 px-4 flex items-center justify-between transition-colors"
            >
                <div className="flex items-center space-x-3">
                    {/* Left connection circle - changes based on connection and data stream */}
                    <div 
                        className={cn(
                            "w-5 h-5 rounded-full border-2 flex items-center justify-center bg-white",
                            isConnected
                                ? 'border-black' // Connected to source AND data stream on: black border (activated)
                                : isConnected
                                  ? 'border-gray-300' // Connected to source: gray border (non-activated)
                                  : 'border-gray-300' // Disconnected: gray border
                        )}
                    >
                        {/* No filled circle - always stay empty */}
                    </div>
                    
                    {/* Status dot */}
                    <div 
                        className={cn(
                            "w-3 h-3 rounded-full",
                            isConnected && isDataStreamOn ?  "bg-[#509693]" : "bg-[#D3D3D3]"
                        )}
                    />
                    
                    {/* Filter text - larger, bold font with ref for measurement */}
                    <span 
                        ref={titleRef}
                        className="font-geist text-[25px] font-[550] leading-tight text-black tracking-wider"
                    >
                        {filters.find((filter) => filter.value === value)?.label || 'Low Pass Filter'}
                    </span>
                </div>
                
                <div className="flex items-center space-x-3">
                    {/* Toggle arrow */}
                    {isExpanded ? (
                        <ChevronUp className="h-5 w-5 text-gray-600" />
                    ) : (
                        <ChevronDown className="h-5 w-5 text-gray-600" />
                    )}
                    
                    {/* Right connection circle - changes based on connection and data stream */}
                    <div 
                        className={cn(
                            "w-5 h-5 rounded-full border-2 flex items-center justify-center bg-white",
                            isConnected
                                ? 'border-black' // Connected to source AND data stream on: black border (activated)
                                : isConnected
                                  ? 'border-gray-300' // Connected to source: gray border (non-activated)
                                  : 'border-gray-300' // Disconnected: gray border
                        )}
                    >
                        {/* No solid circle inside - always stay empty */}
                    </div>
                </div>
            </button>

            {/* Expandable options section */}
            <div 
                className="overflow-hidden"
                style={{
                    maxHeight: isExpanded ? '120px' : '0px',
                    opacity: isExpanded ? 1 : 0,
                    transition: 'max-height 0.3s ease-in-out, opacity 0.3s ease-in-out'
                }}
            >
                <div 
                    className="space-y-0.5 flex flex-col"
                    style={{
                        paddingLeft: '60px', // Align with title start (circle + dot + spacing)
                        paddingRight: '60px', // Same padding on right for symmetry
                        paddingBottom: '8px'
                    }}
                >
                    {filters.map((filter) => (
                        <button
                            key={filter.value}
                            onClick={() => handleOptionSelect(filter.value)}
                            className={cn(
                                "text-left px-3 py-0 text-xs font-normal rounded-lg transition-colours",
                                "block w-full", // Full width within the constrained container
                                value === filter.value 
                                    ? "bg-gray-100 text-gray-900" 
                                    : "text-gray-600 hover:bg-gray-50"
                            )}
                        >
                            {filter.label}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}