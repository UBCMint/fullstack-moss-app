
import * as React from 'react';
import { cn } from '@/lib/utils';

interface ComboBoxProps {
    isConnected?: boolean;
    isDataStreamOn?: boolean;
}

export default function ComboBox({
    isConnected = false,
    isDataStreamOn = false,
}: ComboBoxProps) {
    const [isTriggerActive, setIsTriggerActive] = React.useState(false);

    const handleTriggerClick = () => {
        setIsTriggerActive((prev) => !prev);
    };

    const handlePreviewClick = () => {
        console.log('clicked preview');
    };

    return (
        <div
            className={cn(
                'bg-white rounded-[30px] border-2 overflow-hidden border-[#D3D3D3]'
            )}
            style={{
                width: 'fit-content',
                minWidth: '396px',
            }}
        >
            <div className="w-full h-[70px] px-4 flex items-center justify-between transition-colors">
                <div className="flex items-center">
                    <div
                        className={cn(
                            'absolute left-6 w-6 h-6 rounded-full border-[3px] flex items-center justify-center bg-white',
                            isConnected ? 'border-black' : 'border-gray-300'
                        )}
                    />

                    {/* Status dot */}
                    <div
                        className={cn(
                            'absolute left-16 w-3 h-3 rounded-full',
                            isConnected && isDataStreamOn
                                ? 'bg-[#509693]'
                                : 'bg-[#D3D3D3]'
                        )}
                    />

                    <span className="absolute left-24 font-geist text-[25px] font-[550] leading-tight text-black tracking-wider">
                        Labeling Node
                    </span>
                </div>

                <div className="flex items-center">
                    <div
                        className={cn(
                            'absolute right-6 w-6 h-6 rounded-full border-[3px] flex items-center justify-center bg-white',
                            isConnected ? 'border-black' : 'border-gray-300'
                        )}
                    />
                </div>
            </div>

            <div className="flex flex-col items-center gap-2 pb-3">
                <span className="text-[24px] leading-none text-black">
                    {isTriggerActive ? 'Stop labeling' : 'Start labeling'}
                </span>

                <div className="flex items-center gap-3">
                    <button
                        className={cn(
                            'mt-1 text-lg px-3 py-1 rounded-md border border-[#2E7B75] transition-colors',
                            isTriggerActive
                                ? 'bg-white text-[#2E7B75]'
                                : 'bg-[#2E7B75] text-white'
                        )}
                        onClick={handleTriggerClick}
                    >
                        Trigger
                    </button>

                    <button
                        className="mt-1 text-lg px-2 py-1 rounded-md text-black hover:text-[#2E7B75] transition-colors"
                        onClick={handlePreviewClick}
                    >
                        Preview ↗
                    </button>
                </div>
            </div>
        </div>
    );
}
