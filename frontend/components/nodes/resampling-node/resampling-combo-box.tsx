import * as React from 'react';
import { ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

const PRESET_OPTIONS = [
    { value: '200', label: '200 Hz' },
    { value: '256', label: '256 Hz' },
];

export type ResampleRate = '200' | '256' | 'custom';

interface ResamplingComboBoxProps {
    rate: ResampleRate;
    customRate: number;
    onRateChange: (rate: ResampleRate) => void;
    onCustomRateChange: (hz: number) => void;
    isConnected?: boolean;
    isDataStreamOn?: boolean;
}

export default function ResamplingComboBox({
    rate,
    customRate,
    onRateChange,
    onCustomRateChange,
    isConnected = false,
    isDataStreamOn = false,
}: ResamplingComboBoxProps) {
    const [isExpanded, setIsExpanded] = React.useState(false);
    const [customInput, setCustomInput] = React.useState('');

    const selectedHz =
        rate === 'custom' ? `${customRate} Hz` : PRESET_OPTIONS.find((o) => o.value === rate)?.label ?? '';

    return (
        <div
            className={cn('bg-white rounded-[30px] border-2 overflow-hidden', 'border-[#D3D3D3]')}
            style={{ width: 'fit-content', minWidth: '396px' }}
        >
            {/* Header */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full h-[70px] px-4 flex items-center justify-between transition-colors"
            >
                <div className="flex items-center">
                    <div
                        className={cn(
                            'absolute left-6 w-6 h-6 rounded-full border-[3px] flex items-center justify-center bg-white',
                            isConnected ? 'border-black' : 'border-gray-300'
                        )}
                    />
                    <div
                        className={cn(
                            'absolute left-16 w-3 h-3 rounded-full',
                            isConnected && isDataStreamOn ? 'bg-[#509693]' : 'bg-[#D3D3D3]'
                        )}
                    />
                    <span className="absolute left-24 font-geist text-[25px] font-[550] leading-tight text-black tracking-wider">
                        Resampling
                    </span>
                </div>
                <div className="flex items-center">
                    <div className="absolute right-[58px]">
                        <ChevronUp
                            className={`h-5 w-5 text-gray-600 transform transition-all duration-300 ease-in-out ${isExpanded ? 'rotate-0' : 'rotate-180'}`}
                        />
                    </div>
                    <div
                        className={cn(
                            'absolute right-6 w-6 h-6 rounded-full border-[3px] flex items-center justify-center bg-white',
                            isConnected ? 'border-black' : 'border-gray-300'
                        )}
                    />
                </div>
            </button>

            {/* Collapsed summary */}
            {!isExpanded && (
                <div className="pb-4" style={{ paddingLeft: '60px', paddingRight: '60px' }}>
                    <div className="text-[15px] leading-tight text-gray-600">
                        Input size: {selectedHz}
                    </div>
                </div>
            )}

            {/* Expanded options */}
            <div
                className="overflow-hidden"
                style={{
                    maxHeight: isExpanded ? '280px' : '0px',
                    opacity: isExpanded ? 1 : 0,
                    transition: 'max-height 0.3s ease-in-out, opacity 0.3s ease-in-out',
                }}
            >
                <div className="flex flex-col pb-4" style={{ paddingLeft: '60px', paddingRight: '60px' }}>
                    {/* Section label */}
                    <div className="text-sm text-gray-700 mb-0.5">Input size</div>

                    {/* Preset options */}
                    <div className="flex flex-col space-y-0.5">
                        {PRESET_OPTIONS.map((option) => (
                            <button
                                key={option.value}
                                onClick={() => onRateChange(option.value as ResampleRate)}
                                className={cn(
                                    'nodrag text-left px-3 py-1 text-sm font-normal rounded-lg transition-colors',
                                    rate === option.value
                                        ? 'bg-gray-100 text-gray-900'
                                        : 'text-gray-600 hover:bg-gray-50'
                                )}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>

                    {/* Custom Hz input — always visible */}
                    <div className="flex items-center gap-2 pt-1">
                        <input
                            type="number"
                            min={1}
                            value={customInput}
                            placeholder="Enter the optional input:"
                            onChange={(e) => setCustomInput(e.target.value.replace(/[^\d]/g, ''))}
                            className="nodrag h-8 w-full rounded-md border border-gray-300 px-2 text-sm"
                        />
                        <button
                            onClick={() => {
                                if (customInput) {
                                    const parsed = Number(customInput);
                                    if (parsed > 0) {
                                        onCustomRateChange(parsed);
                                        onRateChange('custom');
                                        setCustomInput('');
                                    }
                                }
                                setIsExpanded(false);
                            }}
                            className="nodrag h-8 px-3 rounded-md border border-gray-300 text-sm hover:bg-gray-50"
                        >
                            OK
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
