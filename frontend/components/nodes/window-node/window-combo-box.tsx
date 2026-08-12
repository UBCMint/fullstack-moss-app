import * as React from 'react';
import { ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

export type WindowOption = 'default' | 'custom';

interface ComboBoxProps {
    windowSize: number;
    overlapSize: number;
    selectedOption: WindowOption;
    setWindowSize: (size: number) => void;
    setOverlapSize: (size: number) => void;
    setSelectedOption: (option: WindowOption) => void;
    isConnected?: boolean;
    isDataStreamOn?: boolean;
}

const PRESETS = [200, 250];

interface SizeSectionProps {
    label: string;
    value: number;
    onSelectPreset: (preset: number) => void;
    onSubmitCustom: (parsed: number) => string | null; // returns error message or null
    isOpen: boolean;
    onToggle: () => void;
}

function SizeSection({
    label,
    value,
    onSelectPreset,
    onSubmitCustom,
    isOpen,
    onToggle,
}: SizeSectionProps) {
    const [customInput, setCustomInput] = React.useState<string>('');
    const [error, setError] = React.useState<string>('');
    const isCustom = !PRESETS.includes(value);

    const submitCustom = () => {
        if (customInput === '') return;
        const parsed = Number(customInput);
        const err = onSubmitCustom(parsed);
        if (err) {
            setError(err);
            return;
        }
        setError('');
    };

    return (
        <div>
            {/* Section label bar (click to reveal options) */}
            <button
                onClick={onToggle}
                className="nodrag w-full text-left rounded-md px-3 py-2 text-[20px] text-black bg-gray-100"
            >
                {label}
            </button>

            {/* Options — only visible when this section is open */}
            <div
                className="overflow-hidden"
                style={{
                    maxHeight: isOpen ? '260px' : '0px',
                    opacity: isOpen ? 1 : 0,
                    transition:
                        'max-height 0.25s ease-in-out, opacity 0.25s ease-in-out',
                }}
            >
                {/* Preset options */}
                {PRESETS.map((preset) => (
                    <button
                        key={preset}
                        onClick={() => {
                            onSelectPreset(preset);
                            setCustomInput('');
                            setError('');
                        }}
                        className={cn(
                            'nodrag w-full text-left px-3 py-1 text-[20px] rounded-md hover:bg-gray-50',
                            value === preset
                                ? 'text-black font-medium'
                                : 'text-black'
                        )}
                    >
                        {preset} Hz
                    </button>
                ))}

                {/* Divider */}
                <div className="border-t border-gray-200 mt-2" />

                {/* Optional custom input */}
                <div className="flex items-baseline gap-2 px-3 pt-3">
                    <label className="text-[18px] text-gray-400 whitespace-nowrap">
                        Enter the optional input:
                    </label>
                    <input
                        value={customInput}
                        onChange={(e) => {
                            setCustomInput(
                                e.target.value.replace(/[^\d]/g, '')
                            );
                            setError('');
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') submitCustom();
                        }}
                        onBlur={submitCustom}
                        placeholder="______________"
                        className={cn(
                            'nodrag min-w-0 flex-1 bg-transparent text-[18px] text-gray-700 placeholder:text-gray-400 focus:outline-none',
                            isCustom && 'text-gray-900'
                        )}
                    />
                </div>
                {error && (
                    <div
                        className="text-xs text-red-600 px-3 pt-1"
                        role="alert"
                    >
                        {error}
                    </div>
                )}
            </div>
        </div>
    );
}

export default function ComboBox({
    windowSize,
    overlapSize,
    setWindowSize,
    setOverlapSize,
    setSelectedOption,
    isConnected = false,
    isDataStreamOn = false,
}: ComboBoxProps) {
    const [isExpanded, setIsExpanded] = React.useState(false);
    const [openSection, setOpenSection] = React.useState<
        'window' | 'overlap' | null
    >('window');

    const toggleExpanded = () => setIsExpanded((v) => !v);

    const toggleSection = (section: 'window' | 'overlap') =>
        setOpenSection((curr) => (curr === section ? null : section));

    const selectWindowPreset = (preset: number) => {
        setSelectedOption(PRESETS.includes(preset) ? 'default' : 'custom');
        setWindowSize(preset);
        if (overlapSize >= preset) {
            setOverlapSize(0);
        }
    };

    const submitCustomWindow = (parsed: number): string | null => {
        if (!Number.isInteger(parsed) || parsed <= 0) {
            return 'Window size must be a positive integer';
        }
        if (overlapSize >= parsed) {
            return 'Window size must be greater than overlap size';
        }
        setSelectedOption('custom');
        setWindowSize(parsed);
        return null;
    };

    const selectOverlapPreset = (preset: number): void => {
        if (preset >= windowSize) return;
        setOverlapSize(preset);
    };

    const submitCustomOverlap = (parsed: number): string | null => {
        if (!Number.isInteger(parsed) || parsed < 0) {
            return 'Overlap size must be a non-negative integer';
        }
        if (parsed >= windowSize) {
            return 'Overlap size must be less than window size';
        }
        setOverlapSize(parsed);
        return null;
    };

    return (
        <div
            className={cn(
                'bg-white rounded-[30px] border-2 overflow-hidden',
                'border-[#D3D3D3]'
            )}
            style={{ width: '396px' }}
        >
            {/* Main button/header */}
            <button
                onClick={toggleExpanded}
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
                            isConnected && isDataStreamOn
                                ? 'bg-[#509693]'
                                : 'bg-[#D3D3D3]'
                        )}
                    />

                    <span className="absolute left-24 font-geist text-[25px] font-[550] leading-tight text-black tracking-wider">
                        Window Node
                    </span>
                </div>

                <div className="flex items-center space-x-3">
                    <div className="absolute right-[58px] transition-transform duration-300 ease-in-out">
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
                <div
                    className="space-y-1 pb-4"
                    style={{ paddingLeft: '60px', paddingRight: '60px' }}
                >
                    <div className="text-[20px] leading-tight text-black">
                        Window size: {windowSize}Hz
                    </div>
                    <div className="text-[20px] leading-tight text-black">
                        Overlap size: {overlapSize}Hz
                    </div>
                </div>
            )}

            {/* Expandable section */}
            <div
                className="overflow-hidden nodrag"
                style={{
                    maxHeight: isExpanded ? '420px' : '0px',
                    opacity: isExpanded ? 1 : 0,
                    transition:
                        'max-height 0.3s ease-in-out, opacity 0.3s ease-in-out',
                }}
            >
                <div
                    className="space-y-4 pb-4 overflow-y-auto max-h-[420px]"
                    style={{ paddingLeft: '24px', paddingRight: '24px' }}
                >
                    <SizeSection
                        label="Window size"
                        value={windowSize}
                        onSelectPreset={selectWindowPreset}
                        onSubmitCustom={submitCustomWindow}
                        isOpen={openSection === 'window'}
                        onToggle={() => toggleSection('window')}
                    />
                    <SizeSection
                        label="Overlap size"
                        value={overlapSize}
                        onSelectPreset={selectOverlapPreset}
                        onSubmitCustom={submitCustomOverlap}
                        isOpen={openSection === 'overlap'}
                        onToggle={() => toggleSection('overlap')}
                    />
                </div>
            </div>
        </div>
    );
}
