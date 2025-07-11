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
}

export default function ComboBox({ 
    value = 'lowpass', 
    onValueChange,
    isConnected = false 
}: ComboBoxProps) {
    const [isExpanded, setIsExpanded] = React.useState(false);
    const titleRef = React.useRef<HTMLSpanElement>(null);
    const [titleWidth, setTitleWidth] = React.useState(0);

    // Measure title width when component mounts or value changes
    React.useEffect(() => {
        if (titleRef.current) {
            setTitleWidth(titleRef.current.offsetWidth);
        }
    }, [value]);

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
                "border-gray-200"
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
                className="w-full h-14 px-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
                <div className="flex items-center space-x-3">
                    {/* Left connection circle - only border changes color */}
                    <div 
                        className={cn(
                            "w-5 h-5 rounded-full border-2 flex items-center justify-center bg-white",
                            isConnected 
                                ? "border-black" // Connected: black border
                                : "border-gray-300" // Disconnected: gray border
                        )}
                    >
                        {/* No solid circle inside - always stay empty */}
                    </div>
                    
                    {/* Status dot */}
                    <div 
                        className={cn(
                            "w-2 h-2 rounded-full",
                            isConnected ? "bg-teal-500" : "bg-gray-400"
                        )}
                    />
                    
                    {/* Filter text - larger, bold font with ref for measurement */}
                    <span 
                        ref={titleRef}
                        className="text-xl font-bold text-gray-900 whitespace-nowrap"
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
                    
                    {/* Right connection circle - only border changes color */}
                    <div 
                        className={cn(
                            "w-5 h-5 rounded-full border-2 flex items-center justify-center bg-white",
                            isConnected 
                                ? "border-black" // Connected: black border
                                : "border-gray-300" // Disconnected: gray border
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