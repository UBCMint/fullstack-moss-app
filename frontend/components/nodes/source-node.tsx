import { useGlobalContext } from '@/context/GlobalContext';
import { Handle, Position } from '@xyflow/react';
import { ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import React from 'react';

type DeviceType = 'eeg' | 'eeg-emg';

interface SourceNodeProps {
    selected?: boolean;
}

export default function SourceNode({ selected }: SourceNodeProps) {
    const { dataStreaming, dataSource } = useGlobalContext();
    const [isExpanded, setIsExpanded] = React.useState(false);
    const [deviceType, setDeviceType] = React.useState<DeviceType>('eeg');

    const isImported = !dataStreaming && dataSource === 'imported';

    const title = dataStreaming
        ? deviceType === 'eeg'
            ? 'EEG Device'
            : 'EEG + EMG Device'
        : 'Source Node';
    const subtitle = dataStreaming
        ? 'Headset_001'
        : isImported
          ? 'Imported Data'
          : 'No device connected.';

    return (
        <div
            className={cn(
                'relative w-[396px] bg-white rounded-[30px] border-2 overflow-hidden transition-colors',
                selected
                    ? 'border-[#2E7B75] shadow-[0_0_0_3px_rgba(46,123,117,0.25)]'
                    : 'border-[#D3D3D3]'
            )}
        >
            <div className="relative h-[96px] flex items-center">
                {/* Status dot */}
                <span
                    className={`absolute left-6 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full ${dataStreaming ? 'bg-[#509693]' : 'bg-[#D3D3D3]'}`}
                />

                {/* Texts */}
                <div className="flex flex-col items-start justify-center ml-14">
                    <span
                        className={`font-geist font-[550] leading-tight text-black tracking-wider ${title === 'EEG + EMG Device' ? 'text-[20px]' : 'text-[25px]'}`}
                    >
                        {title}
                    </span>
                    <span className="font-geist text-[14px] font-normal leading-tight text-black mt-0">
                        {subtitle}
                    </span>
                </div>

                {/* Expand/collapse device type selector */}
                <button
                    type="button"
                    onClick={() => setIsExpanded((prev) => !prev)}
                    className="nodrag absolute right-[58px] top-1/2 -translate-y-1/2 flex items-center justify-center"
                    aria-label={
                        isExpanded
                            ? 'Collapse device type'
                            : 'Expand device type'
                    }
                >
                    <ChevronUp
                        className={`h-5 w-5 text-gray-600 transform transition-all duration-300 ease-in-out ${isExpanded ? 'rotate-0' : 'rotate-180'}`}
                    />
                </button>

                {/* Right circle */}
                <span className="absolute right-6 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center border-[3px] border-[#000000]">
                    <span className="w-3 h-3 rounded-full bg-white" />
                    <Handle
                        type="source"
                        position={Position.Right}
                        id="source-node-output"
                        style={{
                            transform: 'translateY(-50%)',
                            width: '32px',
                            height: '32px',
                            backgroundColor: 'transparent',
                            border: '2px solid transparent',
                            borderRadius: '50%',
                            zIndex: 10,
                        }}
                    />
                </span>
            </div>

            {/* Expandable section */}
            <div
                className="overflow-hidden nodrag"
                style={{
                    maxHeight: isExpanded ? '220px' : '0px',
                    opacity: isExpanded ? 1 : 0,
                    transition:
                        'max-height 0.3s ease-in-out, opacity 0.3s ease-in-out',
                }}
            >
                <div
                    className="space-y-2 pb-4"
                    style={{ paddingLeft: '60px', paddingRight: '60px' }}
                >
                    <div className="text-[14px] text-gray-700">Device type</div>
                    <button
                        type="button"
                        onClick={() => setDeviceType('eeg')}
                        className={cn(
                            'nodrag w-full text-left px-3 py-2 rounded-lg text-sm font-normal',
                            deviceType === 'eeg'
                                ? 'bg-gray-100 text-gray-900'
                                : 'text-gray-600 hover:bg-gray-50'
                        )}
                    >
                        EEG
                    </button>
                    <button
                        type="button"
                        onClick={() => setDeviceType('eeg-emg')}
                        className={cn(
                            'nodrag w-full text-left px-3 py-2 rounded-lg text-sm font-normal',
                            deviceType === 'eeg-emg'
                                ? 'bg-gray-100 text-gray-900'
                                : 'text-gray-600 hover:bg-gray-50'
                        )}
                    >
                        EEG + EMG
                    </button>
                    <div className="flex items-center gap-2 rounded-2xl bg-[#FFF0F0] px-3 py-2">
                        <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border border-[#EB0000] text-[13px] text-[#EB0000]">
                            !
                        </span>
                        <span className="text-[13px] text-black">
                            Required for robotic arm control.
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
