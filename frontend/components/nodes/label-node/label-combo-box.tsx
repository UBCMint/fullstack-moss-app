
import * as React from 'react';
import { cn } from '@/lib/utils';
import LabelTimelinePanel, {
    TimelineLabelRow,
} from './label-timeline-panel';

export type LabelColor = 'teal-700' | 'teal-500' | 'teal-300' | 'mint-100';

interface ComboBoxProps {
    isConnected?: boolean;
    isDataStreamOn?: boolean;
    isTriggerActive: boolean;
    onTriggerClick: () => void;
    onPreviewOpen: () => void;
    isExpanded: boolean;
    onExpandedClose: () => void;
    onGraphViewClick: () => void;
    isLabelPopupOpen: boolean;
    labelInputValue: string;
    selectedColor: LabelColor;
    onLabelInputChange: (value: string) => void;
    onColorSelect: (color: LabelColor) => void;
    onConfirmLabel: () => void;
    onCloseLabelPopup: () => void;
    timelineRows: TimelineLabelRow[];
    sessionStartTimestamp: string | null;
    latestBackendTimestamp: string | null;
}

export const colorClassMap: Record<LabelColor, string> = {
    'teal-700': 'bg-[#2E7B75]',
    'teal-500': 'bg-[#6CAFA4]',
    'teal-300': 'bg-[#98CDBF]',
    'mint-100': 'bg-[#D6E6D4]',
};

export default function ComboBox({
    isConnected = false,
    isDataStreamOn = false,
    isTriggerActive,
    onTriggerClick,
    onPreviewOpen,
    isExpanded,
    onExpandedClose,
    onGraphViewClick,
    isLabelPopupOpen,
    labelInputValue,
    selectedColor,
    onLabelInputChange,
    onColorSelect,
    onConfirmLabel,
    onCloseLabelPopup,
    timelineRows,
    sessionStartTimestamp,
    latestBackendTimestamp,
}: ComboBoxProps) {
    return (
        <div
            className={cn(
                'bg-white rounded-[30px] border-2 overflow-hidden border-[#D3D3D3]'
            )}
            style={{
                width: 'fit-content',
                minWidth: isExpanded ? '760px' : '396px',
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

            {/* Trigger and Preview buttons */}
            <div className="flex flex-col items-center gap-2 pb-3">
                <span className="text-[24px] leading-none text-black">
                    {isTriggerActive ? 'Stop labeling' : 'Start labeling'}
                </span>

                <div className="flex items-center gap-3">
                    <button
                        className={cn(
                            'mt-1 text-lg px-3 py-1 rounded-md border transition-colors',
                            isTriggerActive
                                ? 'bg-red-500 text-white border-red-500'
                                : 'bg-[#2E7B75] text-white border-[#2E7B75]'
                        )}
                        onClick={onTriggerClick}
                    >
                        Trigger
                    </button>

                    <button
                        className="mt-1 text-lg px-2 py-1 rounded-md text-black hover:text-[#2E7B75] transition-colors"
                        onClick={onPreviewOpen}
                    >
                        Preview ↗
                    </button>
                </div>
            </div>

            {isLabelPopupOpen && (
                <div className="mx-5 mb-4 rounded-[18px] border border-[#D3D3D3] bg-white p-3">
                    <div className="mb-1 flex items-center justify-between">
                        <span className="text-sm text-black">Name</span>
                        <button
                            className="text-[#BFBFBF] hover:text-[#8F8F8F] transition-colors"
                            onClick={onCloseLabelPopup}
                            aria-label="Close label popup"
                        >
                            ×
                        </button>
                    </div>

                    <input
                        type="text"
                        value={labelInputValue}
                        onChange={(event) => onLabelInputChange(event.target.value)}
                        placeholder="Enter label here"
                        className="w-full rounded-md border border-[#E2E2E2] px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-[#6CAFA4]"
                    />

                    <div className="mt-3 flex items-center justify-between">
                        <span className="text-sm text-black">Color</span>

                        <div className="flex items-center gap-4">
                            {(Object.keys(colorClassMap) as LabelColor[]).map((color) => {
                                const isSelected = color === selectedColor;
                                return (
                                    <button
                                        key={color}
                                        className={cn(
                                            'h-3.5 w-3.5 rounded-full transition-all',
                                            colorClassMap[color],
                                            isSelected
                                                ? 'ring-2 ring-offset-2 ring-[#2E7B75]'
                                                : 'ring-0'
                                        )}
                                        onClick={() => onColorSelect(color)}
                                        aria-label={`Select ${color} label color`}
                                    />
                                );
                            })}
                        </div>
                    </div>

                    <div className="mt-3 flex justify-end">
                        <button
                            className="rounded-md px-3 py-1 text-sm transition-colors bg-[#2E7B75] text-white hover:opacity-90"
                            onClick={onConfirmLabel}
                        >
                            Confirm
                        </button>
                    </div>
                </div>
            )}

            <LabelTimelinePanel
                isExpanded={isExpanded}
                rows={timelineRows}
                sessionStartTimestamp={sessionStartTimestamp}
                latestBackendTimestamp={latestBackendTimestamp}
                onClose={onExpandedClose}
                onGraphViewClick={onGraphViewClick}
                isConnected={isConnected}
                isDataStreamOn={isDataStreamOn}
            />
        </div>
    );
}
