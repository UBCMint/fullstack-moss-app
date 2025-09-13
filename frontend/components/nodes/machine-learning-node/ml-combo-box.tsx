import * as React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AlertCircle } from 'lucide-react';

const mlPredictions = [
    {
        value: 'stress',
        label: 'Stress Prediction',
    },
    {
        value: 'focus',
        label: 'Focus Prediction',
    },
    {
        value: 'mood',
        label: 'Mood Prediction',
    },
];

interface MLComboBoxProps {
    value?: string;
    onValueChange?: (value: string) => void;
    isConnected?: boolean;
    isDataStreamOn?: boolean;
}

export default function MLComboBox({
    value = 'stress',
    onValueChange,
    isConnected = false,
    isDataStreamOn = false,
}: MLComboBoxProps) {
    const [isExpanded, setIsExpanded] = React.useState(false);
    const titleRef = React.useRef<HTMLSpanElement>(null);
    const [dismissedError, setDismissedError] = React.useState(false);

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

    // Reset local dismissal whenever the node reconnects/disconnects
    React.useEffect(() => {
        if (isConnected) {
            setDismissedError(false);
        }
    }, [isConnected]);

    return (
        <div
            className={cn('w-full flex flex-col')}
            style={{
                height: isExpanded || (!isConnected && !dismissedError) ? 'auto' : '90px',
                transition: 'height 0.3s ease-in-out',
            }}
        >
            {/* Main button/header */}
            <button
                onClick={toggleExpanded}
                className="w-full px-4 flex items-center justify-between transition-colors flex-shrink-0"
                style={{
                    height: '90px',
                }}
            >
                <div className="flex items-center space-x-3">
                    {/* Left connection circle - changes based on connection and data stream */}
                    <div
                        className={cn(
                            'w-5 h-5 rounded-full border-2 flex items-center justify-center bg-white',
                            isConnected
                                ? 'border-black' // Connected to source AND data stream on: black border (activated)
                                : isConnected
                                  ? 'border-gray-300' // Connected to source: gray border (non-activated)
                                  : 'border-gray-300' // Disconnected: gray border
                        )}
                    ></div>

                    {/* Status dot */}
                    <div
                        className={cn(
                            'w-2 h-2 rounded-full',
                            isConnected && isDataStreamOn
                                ? "bg-[#509693]" : "bg-[#D3D3D3]"
                        )}
                    />

                    {/* ML prediction text - larger, bold font with ref for measurement */}
                    <span
                        ref={titleRef}
                        className="font-geist text-[25px] font-[550] leading-tight text-black tracking-wider"
                    >
                        {mlPredictions.find(
                            (prediction) => prediction.value === value
                        )?.label || 'Stress Prediction'}
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
                            'w-5 h-5 rounded-full border-2 flex items-center justify-center bg-white',
                            isConnected
                                ? 'border-black' // Connected to source AND data stream on: black border (activated)
                                : isConnected
                                  ? 'border-gray-300' // Connected to source: gray border (non-activated)
                                  : 'border-gray-300' // Disconnected: gray border
                        )}
                    ></div>
                </div>
            </button>

            {/* In-card error message when not properly connected */}
            {!isConnected && !dismissedError && (
                <div className="px-5 pb-4 -mt-1">
                    <div className="w-full bg-white rounded-2xl border border-gray-200 px-4 pt-3 pb-4 shadow-sm">
                        <div className="flex items-start space-x-3">
                            <div className="mt-0.5">
                                <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center">
                                    <AlertCircle className="w-4 h-4 text-red-600" />
                                </div>
                            </div>
                            <div className="flex-1 text-left">
                                <div className="text-[18px] font-semibold text-gray-900 leading-6">Error: Expected filtered input but received raw input.</div>
                                <div className="text-[16px] text-gray-800 mt-2">Please attach the prediction node to a filter node.</div>
                                <div className="mt-4 flex justify-center">
                                    <button
                                        onClick={() => setDismissedError(true)}
                                        className="px-4 py-2 rounded-xl bg-[#2B6C66] text-white font-semibold text-[16px]"
                                    >
                                        okay
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Expandable options section */}
            <div
                className="overflow-hidden translate-y-[-18px]"
                style={{
                    height: isExpanded ? 'auto' : '0px',
                    opacity: isExpanded ? 1 : 0,
                    transition:
                        'height 0.3s ease-in-out, opacity 0.3s ease-in-out',
                }}
            >
                <div
                    className="space-y-0.5 flex flex-col"
                    style={{
                        paddingLeft: '60px', // Align with title start (circle + dot + spacing)
                        paddingRight: '60px', // Same padding on right for symmetry
                        paddingBottom: '8px',
                    }}
                >
                    {mlPredictions.map((prediction) => (
                        <button
                            key={prediction.value}
                            onClick={() => handleOptionSelect(prediction.value)}
                            className={cn(
                                'text-left px-3 py-0 text-xs font-normal rounded-lg transition-colours',
                                'block w-full', // Full width within the constrained container
                                value === prediction.value
                                    ? 'bg-gray-100 text-gray-900'
                                    : 'text-gray-600 hover:bg-gray-50'
                            )}
                        >
                            {prediction.label}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
