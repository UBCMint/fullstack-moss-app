import * as React from 'react';
import { ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

const PRESET_OPTIONS = [
    { value: 'input', label: 'Input size' },
    { value: '200', label: '200 Hz' },
    { value: '256', label: '256 Hz' },
];

// Custom rates are whole Hz. 256 Hz is the Muse 2 native rate (the app default).
export const MIN_CUSTOM_RATE_HZ = 1;
export const MAX_CUSTOM_RATE_HZ = 256;

export type ResampleRate = '200' | '256' | 'input' | 'custom';

interface ResamplingComboBoxProps {
    rate: ResampleRate;
    customRate: number;
    onRateChange: (rate: ResampleRate) => void;
    onCustomRateChange: (hz: number) => void;
    isConnected?: boolean;
    isDataStreamOn?: boolean;
    isNodeSelected?: boolean;
}

export default function ResamplingComboBox({
    rate,
    customRate,
    onRateChange,
    onCustomRateChange,
    isConnected = false,
    isDataStreamOn = false,
    isNodeSelected = false,
}: ResamplingComboBoxProps) {
    const [isExpanded, setIsExpanded] = React.useState(false);
    const [customDraft, setCustomDraft] = React.useState(String(customRate));

    const draftValue = Number(customDraft);
    const customError =
        customDraft.trim() === ''
            ? 'Enter a rate'
            : !Number.isInteger(draftValue)
              ? 'Rate must be a whole number'
              : draftValue < MIN_CUSTOM_RATE_HZ ||
                  draftValue > MAX_CUSTOM_RATE_HZ
                ? `Rate must be between ${MIN_CUSTOM_RATE_HZ} and ${MAX_CUSTOM_RATE_HZ} Hz`
                : '';

    // Only valid rates reach the node; the draft holds whatever is being typed.
    const handleCustomChange = (value: string) => {
        setCustomDraft(value);
        const parsed = Number(value);
        if (
            value.trim() !== '' &&
            Number.isInteger(parsed) &&
            parsed >= MIN_CUSTOM_RATE_HZ &&
            parsed <= MAX_CUSTOM_RATE_HZ
        ) {
            onCustomRateChange(parsed);
        }
    };

    // selectedLabel intentionally omitted — header shows static "Resampling"

    return (
        <div
            className={cn(
                'bg-white rounded-[30px] border-2 overflow-hidden transition-colors',
                isNodeSelected
                    ? 'border-[#2E7B75] shadow-[0_0_0_3px_rgba(46,123,117,0.25)]'
                    : 'border-[#D3D3D3]'
            )}
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
                            'absolute left-6 w-8 h-8 rounded-full border-[3px] flex items-center justify-center bg-white',
                            isConnected ? 'border-black' : 'border-gray-300'
                        )}
                    />
                    <div
                        className={cn(
                            'absolute left-16 w-3 h-3 rounded-full',
                            isConnected && isDataStreamOn
                                ? 'bg-[#509693]'
                                : 'bg-[#D3D3D3]'
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
                            'absolute right-6 w-8 h-8 rounded-full border-[3px] flex items-center justify-center bg-white',
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
                    transition:
                        'max-height 0.3s ease-in-out, opacity 0.3s ease-in-out',
                }}
            >
                <div
                    className="flex flex-col pb-4"
                    style={{ paddingLeft: '60px', paddingRight: '60px' }}
                >
                    <div className="flex flex-col space-y-0.5">
                        {PRESET_OPTIONS.map((option) => (
                            <button
                                key={option.value}
                                onClick={() =>
                                    onRateChange(option.value as ResampleRate)
                                }
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
                        <div className="mt-2 px-3 flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                                <input
                                    type="number"
                                    min={MIN_CUSTOM_RATE_HZ}
                                    max={MAX_CUSTOM_RATE_HZ}
                                    step={1}
                                    value={customDraft}
                                    onChange={(e) =>
                                        handleCustomChange(e.target.value)
                                    }
                                    onBlur={() => {
                                        if (customError) {
                                            setCustomDraft(String(customRate));
                                        }
                                    }}
                                    aria-invalid={customError !== ''}
                                    className={cn(
                                        'w-24 border rounded-lg px-2 py-1 text-sm text-gray-800 focus:outline-none focus:ring-1',
                                        customError
                                            ? 'border-red-400 focus:ring-red-400'
                                            : 'border-gray-300 focus:ring-[#509693]'
                                    )}
                                />
                                <span className="text-sm text-gray-500">
                                    Hz ({MIN_CUSTOM_RATE_HZ}–
                                    {MAX_CUSTOM_RATE_HZ})
                                </span>
                            </div>
                            {customError && (
                                <div
                                    className="text-xs text-red-600"
                                    role="alert"
                                >
                                    {customError}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
