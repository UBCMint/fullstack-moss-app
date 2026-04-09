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


            {/* Exanded Section */}
            <div
                className="overflow-hidden bg-gray-50/50"
                style={{
                    maxHeight: isExpanded ? '320px' : '0px',
                    opacity: isExpanded ? 1 : 0,
                    transition: 'max-height 0.3s ease-in-out, opacity 0.3s ease-in-out',
                }}
            >
                <div
                    className="flex flex-col space-y-4 pt-2"
                    style={{
                        paddingLeft: '60px',
                        paddingRight: '60px',
                        paddingBottom: '20px',
                    }}
                >
                    {/* Mode Toggle */}
                    <div className="flex flex-col space-y-2">
                        <label className="flex items-center space-x-2 cursor-pointer">
                            <input
                                type="radio"
                                className="w-4 h-4 text-black border-gray-300 focus:ring-black"
                                checked={mode === 'auto'}
                                onChange={() => onModeChange('auto')}
                            />
                            <span className="text-sm font-medium text-gray-800">Auto Calibrate</span> <span className="text-sm italic text-gray-400">(Recommended)</span>

                        </label>
                        <label className="flex items-center space-x-2 cursor-pointer">
                            <input
                                type="radio"
                                className="w-4 h-4 text-black border-gray-300 focus:ring-black"
                                checked={mode === 'manual'}
                                onChange={() => onModeChange('manual')}
                            />
                            <span className="text-sm font-medium text-gray-800">Manual Calibration</span>
                        </label>
                    </div>

                    {/* Checkboxes (dropdown enabled only if manual) */}
                    <div 
                        className="overflow-hidden transition-all duration-300 ease-in-out"
                        style={{
                            maxHeight: mode === 'manual' ? '100px' : '0px',
                            opacity: mode === 'manual' ? 1 : 0,
                            marginTop: mode === 'manual' ? '0.5rem' : '0px',
                        }}
                    >
                        <div className="flex flex-col space-y-2 pl-6 mb-2">
                            <label className="flex items-center space-x-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="w-4 h-4 rounded text-black border-gray-300 focus:ring-black"
                                    checked={selectedArtifacts.includes('eye_blink')}
                                    onChange={() => handleArtifactToggle('eye_blink')}
                                />
                                <span className="text-sm text-gray-600">Eye Blinks</span>
                            </label>
                            <label className="flex items-center space-x-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="w-4 h-4 rounded text-black border-gray-300 focus:ring-black"
                                    checked={selectedArtifacts.includes('muscle_tension')}
                                    onChange={() => handleArtifactToggle('muscle_tension')}
                                />
                                <span className="text-sm text-gray-600">Muscle Tension</span>
                            </label>
                        </div>
                    </div>

                    {/* Intensity Slider */}
                    <div className="pt-2 w-full">
                        <div className="h-px bg-gray-200 w-full mb-4" />
                        <div className="flex flex-col space-y-5">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-bold text-gray-400">Filter Intensity</span>
                            </div>
                            <Slider
                                value={[intensity]}
                                onValueChange={(val) => onIntensityChange(val[0])}
                                max={100}
                                step={1}
                                className="w-full"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
