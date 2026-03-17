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

const presetWindows: Array<{ value: WindowOption; label: string; size?: number }> = [
    { value: 'default', label: 'Default (64)', size: 64 },
    { value: 'custom', label: 'Custom' },
];

export default function ComboBox({
    windowSize,
    overlapSize,
    selectedOption,
    setWindowSize,
    setOverlapSize,
    setSelectedOption,
    isConnected = false,
    isDataStreamOn = false,
}: ComboBoxProps) {
    const [isExpanded, setIsExpanded] = React.useState(false);
    const [step, setStep] = React.useState<'window' | 'overlap'>('window');
    const [customWindowInput, setCustomWindowInput] = React.useState<string>('');
    const [customOverlapInput, setCustomOverlapInput] = React.useState<string>('');
    const [windowError, setWindowError] = React.useState<string>('');
    const [overlapError, setOverlapError] = React.useState<string>('');
    const [overlapOption, setOverlapOption] = React.useState<'default' | 'custom'>('default');

    const toggleExpanded = () => {
        if (!isExpanded) {
            setStep('window');
            setWindowError('');
            setOverlapError('');
        }
        setIsExpanded(!isExpanded);
    };

    const confirmWindow = () => {
        setStep('overlap');
    };

    const confirmOverlap = () => {
        setIsExpanded(false);
        setStep('window');
    };

    const handlePresetSelect = (optionValue: WindowOption, size?: number) => {
        setSelectedOption(optionValue);
        setWindowError('');
        if (typeof size === 'number') {
            setWindowSize(size);
            if (overlapSize >= size) {
                setOverlapSize(0);
                setOverlapOption('default');
            }
        }
        if (optionValue === 'custom') {
            setCustomWindowInput('');
        } else {
            confirmWindow();
        }
    };

    const submitCustomWindow = () => {
        const parsed = Number(customWindowInput);
        if (!Number.isInteger(parsed) || parsed <= 0) {
            setWindowError('Window size must be a positive integer');
            return;
        }
        if (overlapSize >= parsed) {
            setWindowError('Window size must be greater than overlap size');
            return;
        }
        setSelectedOption('custom');
        setWindowSize(parsed);
        setWindowError('');
        setOverlapError('');
        confirmWindow();
    };

    const submitCustomOverlap = () => {
        const parsed = Number(customOverlapInput);
        if (!Number.isInteger(parsed) || parsed < 0) {
            setOverlapError('Overlap size must be a non-negative integer');
            return;
        }
        if (parsed >= windowSize) {
            setOverlapError('Overlap size must be less than window size');
            return;
        }
        setOverlapSize(parsed);
        setOverlapError('');
        setWindowError('');
        confirmOverlap();
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
                            isConnected && isDataStreamOn ? 'bg-[#509693]' : 'bg-[#D3D3D3]'
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
                <div className="space-y-3 pb-4" style={{ paddingLeft: '60px', paddingRight: '60px' }}>
                    <div className="text-[20px] leading-tight text-black">
                        Size:{' '}
                        <span className="inline-flex w-12 h-12 rounded-full border border-[#509693] items-center justify-center">
                            {windowSize}
                        </span>
                    </div>
                    <div className="text-[20px] leading-tight text-black">
                        Overlap Size:{' '}
                        <span className="inline-flex w-12 h-12 rounded-full border border-[#509693] items-center justify-center">
                            {overlapSize}
                        </span>
                    </div>
                </div>
            )}

            {/* Expandable section */}
            <div
                className="overflow-hidden nodrag"
                style={{
                    maxHeight: isExpanded ? '320px' : '0px',
                    opacity: isExpanded ? 1 : 0,
                    transition: 'max-height 0.3s ease-in-out, opacity 0.3s ease-in-out',
                }}
            >
                <div className="space-y-2 pb-3 overflow-y-auto max-h-[320px]" style={{ paddingLeft: '60px', paddingRight: '60px' }}>

                    {/* Step 1: Input size */}
                    {step === 'window' && (
                        <>
                            <div className="text-xs text-gray-700">Input size</div>
                            {presetWindows.map((preset) => (
                                <button
                                    key={preset.label}
                                    onClick={() => handlePresetSelect(preset.value, preset.size)}
                                    className={cn(
                                        'nodrag w-full text-left px-3 py-0 rounded-lg text-xs font-normal',
                                        selectedOption === preset.value ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50'
                                    )}
                                >
                                    {preset.label}
                                </button>
                            ))}
                            {selectedOption === 'custom' && (
                                <div className="flex items-center gap-2 pt-1">
                                    <input
                                        value={customWindowInput}
                                        onChange={(e) => {
                                            setCustomWindowInput(e.target.value.replace(/[^\d]/g, ''));
                                            setWindowError('');
                                        }}
                                        placeholder="Custom integer"
                                        className="nodrag h-8 w-full rounded-md border border-gray-300 px-2 text-sm"
                                    />
                                    <button
                                        onClick={submitCustomWindow}
                                        className="nodrag h-8 px-3 rounded-md border border-gray-300 text-sm hover:bg-gray-50"
                                    >
                                        OK
                                    </button>
                                </div>
                            )}
                            {selectedOption === 'custom' && windowError && (
                                <div className="text-xs text-red-600 -mt-1" role="alert">{windowError}</div>
                            )}
                        </>
                    )}

                    {/* Step 2: Overlap size */}
                    {step === 'overlap' && (
                        <>
                            <div className="text-xs text-gray-700">Overlap size</div>
                            <button
                                onClick={() => { setOverlapOption('default'); setOverlapSize(0); setOverlapError(''); confirmOverlap(); }}
                                className={cn(
                                    'nodrag w-full text-left px-3 py-0 rounded-lg text-xs font-normal',
                                    overlapOption === 'default' ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50'
                                )}
                            >
                                Default (0)
                            </button>
                            <button
                                onClick={() => { setOverlapOption('custom'); setCustomOverlapInput(''); setOverlapError(''); }}
                                className={cn(
                                    'nodrag w-full text-left px-3 py-0 rounded-lg text-xs font-normal',
                                    overlapOption === 'custom' ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50'
                                )}
                            >
                                Custom
                            </button>
                            {overlapOption === 'custom' && (
                                <div className="flex items-center gap-2 pt-1">
                                    <input
                                        value={customOverlapInput}
                                        onChange={(e) => {
                                            setCustomOverlapInput(e.target.value.replace(/[^\d]/g, ''));
                                            setOverlapError('');
                                        }}
                                        placeholder="Custom integer"
                                        className="nodrag h-8 w-full rounded-md border border-gray-300 px-2 text-sm"
                                    />
                                    <button
                                        onClick={submitCustomOverlap}
                                        className="nodrag h-8 px-3 rounded-md border border-gray-300 text-sm hover:bg-gray-50"
                                    >
                                        OK
                                    </button>
                                </div>
                            )}
                            {overlapError && <div className="text-xs text-red-600 -mt-1" role="alert">{overlapError}</div>}
                        </>
                    )}

                </div>
            </div>
        </div>
    );
}
