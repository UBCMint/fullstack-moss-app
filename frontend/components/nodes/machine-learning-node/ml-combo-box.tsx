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
    // Hardcoded predictions (temporary until API available)
    const [predictionReady, setPredictionReady] = React.useState(false);
    const [stressYes, setStressYes] = React.useState(true);
    const [focusPercent, setFocusPercent] = React.useState(75); // 0-100
    const [moodScore, setMoodScore] = React.useState(0.83); // -1 to +1
    const [moodLabel, setMoodLabel] = React.useState('Cheerful');

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

    // Simulate prediction availability when connected and streaming
    React.useEffect(() => {
        if (isConnected && isDataStreamOn) {
            // Simulate a short delay as if awaiting a model response
            const timer = setTimeout(() => {
                setPredictionReady(true);
            }, 500);
            return () => clearTimeout(timer);
        }
        setPredictionReady(false);
    }, [isConnected, isDataStreamOn]);

    // Update hardcoded prediction values when the selected prediction changes
    React.useEffect(() => {
        if (value === 'stress') {
            setStressYes(true);
        } else if (value === 'focus') {
            setFocusPercent(75);
        } else if (value === 'mood') {
            setMoodScore(0.83);
            setMoodLabel('Cheerful');
        }
    }, [value]);

    return (
        <div
            className={cn('w-full flex flex-col')}
            style={{
                height:
                    isExpanded ||
                    (!isConnected && !dismissedError) ||
                    (isConnected && isDataStreamOn)
                        ? 'auto'
                        : '90px',
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
                                ? 'bg-teal-500'
                                : 'bg-gray-400'
                        )}
                    />

                    {/* ML prediction text - larger, bold font with ref for measurement */}
                    <span
                        ref={titleRef}
                        className="text-xl font-bold text-gray-900 whitespace-nowrap"
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
                            isConnected && isDataStreamOn
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

            {/* Predictions display when connected and streaming */}
            {isConnected && isDataStreamOn && predictionReady && (
                <div className="px-5 pb-4 -mt-1">
                    <div className="w-full bg-white rounded-2xl border border-gray-200 px-4 pt-3 pb-4 shadow-sm">
                        <div className="flex items-center justify-between">
                            <div
                                className={cn(
                                    'w-5 h-5 rounded-full border-2 bg-white',
                                    isConnected && isDataStreamOn ? 'border-black' : 'border-gray-300'
                                )}
                            />
                            <div className="flex-1 flex items-center justify-center space-x-2">
                                <div
                                    className={cn(
                                        'w-2 h-2 rounded-full',
                                        isDataStreamOn ? 'bg-teal-500' : 'bg-gray-300'
                                    )}
                                />
                                <div className="text-[22px] font-semibold text-gray-900 leading-6">Predicted</div>
                            </div>
                            <div
                                className={cn(
                                    'w-5 h-5 rounded-full border-2 bg-white',
                                    isConnected && isDataStreamOn ? 'border-black' : 'border-gray-300'
                                )}
                            />
                        </div>
                        <div className="mt-2">

                                {/* Stress prediction */}
                                {value === 'stress' && (
                                    <div className="mt-3 flex flex-col items-center text-center">
                                        <div className="text-[16px] text-gray-800">Stress:</div>
                                        <div className="mt-2 inline-flex items-center">
                                            <span className="px-2.5 py-1 rounded-full border border-red-300 bg-red-50 text-[14px] font-semibold text-red-700">
                                                {stressYes ? 'YES' : 'NO'}
                                            </span>
                                        </div>
                                    </div>
                                )}

                                {/* Focus prediction */}
                                {value === 'focus' && (
                                    <div className="mt-3 flex flex-col items-center text-center">
                                        <div className="text-[16px] text-gray-800">Focus:</div>
                                        <div className="mt-2">
                                            <div
                                                className="relative w-14 h-14 rounded-full"
                                                style={{
                                                    background: `conic-gradient(#6DB9B2 0deg ${focusPercent * 3.6}deg, #e5e7eb ${focusPercent * 3.6}deg 360deg)`,
                                                }}
                                            >
                                                <div className="absolute inset-1 bg-white rounded-full flex items-center justify-center text-[14px] font-semibold text-gray-800">
                                                    {focusPercent}%
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Mood prediction */}
                                {value === 'mood' && (
                                    <div className="mt-3 flex flex-col items-center text-center">
                                        <div className="text-[16px] text-gray-800">Mood:</div>
                                        <div className="mt-2 relative w-44">
                                            {/* Value chip with pointer */}
                                            <div
                                                className="absolute -top-7"
                                                style={{
                                                    left: `${((moodScore + 1) / 2) * 100}%`,
                                                    transform: 'translateX(-50%)',
                                                }}
                                            >
                                                <div className="px-2 py-0.5 rounded-full bg-white border border-[#6DB9B2] text-[#2B6C66] text-[12px] font-semibold shadow-sm">
                                                    {moodScore > 0 ? '+' : ''}{moodScore.toFixed(2)}
                                                </div>
                                                <div
                                                    className="w-0 h-0 mx-auto"
                                                    style={{
                                                        borderLeft: '6px solid transparent',
                                                        borderRight: '6px solid transparent',
                                                        borderTop: '6px solid #2B6C66',
                                                        marginTop: '4px',
                                                    }}
                                                />
                                            </div>

                                            {/* Gradient bar */}
                                            <div
                                                className="h-4 rounded-full shadow-inner"
                                                style={{
                                                    background:
                                                        'linear-gradient(90deg, #E53935 0%, #FBC02D 50%, #43A047 100%)',
                                                }}
                                            />
                                        </div>
                                    </div>
                                )}
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
