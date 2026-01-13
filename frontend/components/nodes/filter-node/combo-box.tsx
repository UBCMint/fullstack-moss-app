import * as React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Slider } from '@/components/ui/slider';

const filters = [
    {
        value: 'lowpass',
        label: 'Low Pass Filter',
    },
    {
        value: 'highpass',
        label: 'High Pass Filter',
    },
    {
        value: 'bandpass',
        label: 'Bandpass Filter',
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
    isDataStreamOn = false,
}: ComboBoxProps) {
    const [isExpanded, setIsExpanded] = React.useState(false);
    const titleRef = React.useRef<HTMLSpanElement>(null);
    const [sliderValue, setSliderValue] = React.useState([75]);
    const [cutoff, setCutoff] = React.useState([75]);

    const [lowCutoff, setLowCutoff] = React.useState([25]);
    const [highCutoff, setHighCutoff] = React.useState([75]);

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
                'bg-white rounded-[30px] border-2 overflow-hidden',
                // Node border stays gray - no change with connection
                'border-[#D3D3D3]'
            )}
            style={{
                width: 'fit-content',
                minWidth: '396px', // changed width to 396px, same width as source-node
            }}
        >
            {/* Main button/header */}
            <button
                onClick={toggleExpanded}
                className="w-full h-[70px] px-4 flex items-center justify-between transition-colors"
            >
                <div className="flex items-center">
                    {/* Left connection circle - changes based on connection and data stream */}
                    <div
                        className={cn(
                            'absolute left-6 w-6 h-6 rounded-full border-[3px] flex items-center justify-center bg-white',
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
                            'absolute left-16 w-3 h-3 rounded-full',
                            isConnected && isDataStreamOn
                                ? 'bg-[#509693]'
                                : 'bg-[#D3D3D3]'
                        )}
                    />

                    {/* Filter text - larger, bold font with ref for measurement */}
                    <span
                        ref={titleRef}
                        className="absolute left-24 font-geist text-[25px] font-[550] leading-tight text-black tracking-wider"
                    >
                        {filters.find((filter) => filter.value === value)
                            ?.label || 'Low Pass Filter'}
                    </span>
                </div>

                <div className="flex items-center space-x-3">
                    {/* Toggle arrow */}
                    <div className="absolute right-[58px] transition-transform duration-300 ease-in-out">
                        <ChevronUp
                            className={`h-5 w-5 text-gray-600 transform transition-all duration-300 ease-in-out ${isExpanded ? 'rotate-0' : 'rotate-180'
                                }`}
                        />
                    </div>

                    {/* Right connection circle - changes based on connection and data stream */}
                    <div
                        className={cn(
                            'absolute right-6 w-6 h-6 rounded-full border-[3px] flex items-center justify-center bg-white',
                            isConnected
                                ? 'border-black' // Connected to source AND data stream on: black border (activated)
                                : isConnected
                                    ? 'border-gray-300' // Connected to source: gray border (non-activated)
                                    : 'border-gray-300' // Disconnected: gray border
                        )}
                    >
                        {/* No solid circle inside */}
                    </div>
                </div>
            </button>

            {/* Slider row under the header */}
            <div
                className="space-y-1 pb-3 pt-1"
                style={{
                    paddingLeft: '60px', // aligns with the title start
                    paddingRight: '60px',
                }}
            >
                {value != 'bandpass' && (
                    <div>
                        <Slider
                            value={sliderValue}
                            onValueChange={setSliderValue}
                            max={100}
                            min={0}
                            step={1}
                            className="w-full"
                        />
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-xs text-gray-500">0</span>
                            <span className="text-xs text-gray-500">100</span>
                        </div>
                    </div>
                )}

                {/* Single slider for lowpass and highpass */}
                {value == 'bandpass' && (
                    <div>
                        {/* Low cutoff */}
                        <div>

                            <Slider
                                value={lowCutoff}
                                onValueChange={(val) => {
                                    // prevent low from going above high
                                    const next =
                                        val[0] >= highCutoff[0]
                                            ? highCutoff[0] - 1
                                            : val[0];
                                    setLowCutoff([next]);
                                }}
                                min={0}
                                max={100}
                                step={1}
                                className="w-full mb-1"
                            />
                        </div>

                        <div className="flex justify-between items-center mb-5">
                            <span className="text-xs text-gray-500">0</span>
                            <span className="text-xs text-gray-500">Low Cutoff</span>
                            <span className="text-xs text-gray-500">100</span>
                        </div>

                        {/* High cutoff */}
                        <div>
                            <Slider
                                value={highCutoff}
                                onValueChange={(val) => {
                                    // prevent high from going below low
                                    const next =
                                        val[0] <= lowCutoff[0]
                                            ? lowCutoff[0] + 1
                                            : val[0];
                                    setHighCutoff([next]);
                                }}
                                min={0}
                                max={100}
                                step={1}
                                className="w-full mb-1"
                            />
                        </div>

                        <div className="flex justify-between items-center mb-1">
                            <span className="text-xs text-gray-500">0</span>
                            <span className="text-xs text-gray-500">High Cutoff</span>
                            <span className="text-xs text-gray-500">100</span>
                        </div>
                    </div>
                )}

            </div>

            {/* Expandable options section */}
            <div
                className="overflow-hidden"
                style={{
                    maxHeight: isExpanded ? '120px' : '0px',
                    opacity: isExpanded ? 1 : 0,
                    transition:
                        'max-height 0.3s ease-in-out, opacity 0.3s ease-in-out',
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
                    {filters.map((filter) => (
                        <button
                            key={filter.value}
                            onClick={() => handleOptionSelect(filter.value)}
                            className={cn(
                                'text-left px-3 py-0 text-xs font-normal rounded-lg transition-colours',
                                'block w-full', // Full width within the constrained container
                                value === filter.value
                                    ? 'bg-gray-100 text-gray-900'
                                    : 'text-gray-600 hover:bg-gray-50'
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
