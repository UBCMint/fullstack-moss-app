import * as React from 'react';
import { ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Slider } from '@/components/ui/slider';

export type ArtifactMode = 'auto' | 'manual';

export interface ArtifactComboBoxProps {
    mode: ArtifactMode;
    onModeChange: (mode: ArtifactMode) => void;
    selectedArtifacts: string[];
    onSelectedArtifactsChange: (artifacts: string[]) => void;
    intensity: number;
    onIntensityChange: (intensity: number) => void;
    isConnected?: boolean;
    isDataStreamOn?: boolean;
}

export default function ArtifactComboBox({
    mode,
    onModeChange,
    selectedArtifacts,
    onSelectedArtifactsChange,
    intensity,
    onIntensityChange,
    isConnected = false,
    isDataStreamOn = false,
}: ArtifactComboBoxProps) {
    const [isExpanded, setIsExpanded] = React.useState(false);

    const toggleExpanded = () => setIsExpanded(!isExpanded);

    const handleArtifactToggle = (artifact: string) => {
        if (selectedArtifacts.includes(artifact)) {
            onSelectedArtifactsChange(selectedArtifacts.filter(a => a !== artifact));
        } else {
            onSelectedArtifactsChange([...selectedArtifacts, artifact]);
        }
    };

    return (
        <div
            className={cn(
                'bg-white rounded-[30px] border-2 overflow-hidden',
                'border-[#D3D3D3]'
            )}
            style={{
                width: 'fit-content',
                minWidth: '396px',
            }}
        >
            {/* Header / Toggle */}
            <button
                onClick={toggleExpanded}
                className="w-full h-[90px] px-4 flex items-center justify-between transition-colors"
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
                    <span
                        className="absolute left-24 font-geist text-[25px] font-[550] leading-tight text-black tracking-wider"
                    >
                        Artifact Removal
                    </span>
                </div>

                <div className="flex items-center space-x-3">
                    <div className="absolute right-[58px] transition-transform duration-300 ease-in-out">
                        <ChevronUp
                            className={`h-5 w-5 text-gray-600 transform transition-all duration-300 ease-in-out ${isExpanded ? 'rotate-0' : 'rotate-180'
                                }`}
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


            {/* Expanded Section */}
            <div
                className="overflow-hidden"
                style={{
                    maxHeight: isExpanded ? '360px' : '0px',
                    opacity: isExpanded ? 1 : 0,
                    transition: 'max-height 0.3s ease-in-out, opacity 0.3s ease-in-out',
                }}
            >
                <div
                    className="flex flex-col pt-0 pb-5"
                    style={{ paddingLeft: '60px', paddingRight: '60px' }}
                >
                    {/* Mode options — styled list items */}
                    <div className="flex flex-col space-y-0.5">
                        <button
                            onClick={() => onModeChange('auto')}
                            className={cn(
                                'text-left px-3 py-1 text-sm rounded-lg transition-colors',
                                mode === 'auto' ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50'
                            )}
                        >
                            Auto Calibrate <span className="italic text-gray-400">(Recommended)</span>
                        </button>
                        <button
                            onClick={() => onModeChange('manual')}
                            className={cn(
                                'text-left px-3 py-1 text-sm rounded-lg transition-colors',
                                mode === 'manual' ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50'
                            )}
                        >
                            Manually Calibration
                        </button>
                    </div>

                    {/* Checkboxes — visible only in manual mode */}
                    <div
                        className="overflow-hidden transition-all duration-300 ease-in-out"
                        style={{
                            maxHeight: mode === 'manual' ? '100px' : '0px',
                            opacity: mode === 'manual' ? 1 : 0,
                        }}
                    >
                        <div className="flex flex-col space-y-1 pl-3 mt-1">
                            <label className="flex items-center space-x-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="w-4 h-4 rounded accent-[#509693]"
                                    checked={selectedArtifacts.includes('eye_blink')}
                                    onChange={() => handleArtifactToggle('eye_blink')}
                                />
                                <span className="text-sm text-gray-600">Eye Blinks</span>
                            </label>
                            <label className="flex items-center space-x-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="w-4 h-4 rounded accent-[#509693]"
                                    checked={selectedArtifacts.includes('muscle_tension')}
                                    onChange={() => handleArtifactToggle('muscle_tension')}
                                />
                                <span className="text-sm text-gray-600">Muscle Tension</span>
                            </label>
                        </div>
                    </div>

                    {/* Intensity Slider */}
                    <div className="pt-3 w-full">
                        <div className="h-px bg-gray-200 w-full mb-3" />
                        <span className="text-xs font-bold tracking-widest text-gray-400 uppercase">Filter Intensity</span>
                        <div className="mt-5 mb-1">
                            <Slider
                                value={[intensity]}
                                onValueChange={(val) => onIntensityChange(val[0])}
                                max={100}
                                step={1}
                                className="w-full"
                            />
                        </div>
                        <div className="flex justify-between text-xs text-gray-400 mt-1">
                            <span>0</span>
                            <span>100</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
