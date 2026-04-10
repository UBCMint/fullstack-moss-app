import * as React from 'react';
import { ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

const PRESET_OPTIONS = [
    { value: 'input', label: 'Input size' },
    { value: '200', label: '200 Hz' },
    { value: '256', label: '256 Hz' },
];

export type ResampleRate = '200' | '256' | 'input' | 'custom';

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

    const selectedLabel =
        PRESET_OPTIONS.find((o) => o.value === rate)?.label ??
        (rate === 'custom' ? `${customRate} Hz` : 'Resampling');

    return (
        <div
            className={cn('bg-white rounded-[30px] border-2 overflow-hidden', 'border-[#D3D3D3]')}
            style={{ width: 'fit-content', minWidth: '396px' }}
        >
            {/* Header */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full h-[55px] px-4 flex items-center justify-between transition-colors"
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
                    <div className="flex flex-col space-y-0.5">
                        {PRESET_OPTIONS.map((option) => (
                            <button
                                key={option.value}
                                onClick={() => onRateChange(option.value as ResampleRate)}
                                className={cn(
                                    'text-left px-3 py-1 text-sm rounded-lg transition-colors',
                                    rate === option.value
                                        ? 'bg-gray-100 text-gray-900'
                                        : 'text-gray-600 hover:bg-gray-50'
                                )}
                            >
                                {option.label}
                            </button>
                        ))}
                        <button
                            onClick={() => onRateChange('custom')}
                            className={cn(
                                'text-left px-3 py-1 text-sm rounded-lg transition-colors',
                                rate === 'custom'
                                    ? 'bg-gray-100 text-gray-900'
                                    : 'text-gray-600 hover:bg-gray-50'
                            )}
                        >
                            Custom
                        </button>
                    </div>

                    {/* Custom Hz input */}
                    {rate === 'custom' && (
                        <div className="mt-2 px-3 flex items-center gap-2">
                            <input
                                type="number"
                                min={1}
                                value={customRate}
                                onChange={(e) => onCustomRateChange(Number(e.target.value))}
                                className="w-24 border border-gray-300 rounded-lg px-2 py-1 text-sm text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#509693]"
                            />
                            <span className="text-sm text-gray-500">Hz</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
