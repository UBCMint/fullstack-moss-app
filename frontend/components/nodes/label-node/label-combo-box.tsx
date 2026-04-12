import * as React from 'react';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import LabelTimelinePanel, {
    LabelGraphPoint,
    TimelineLabelRow,
} from '@/components/nodes/label-node/label-timeline-panel';

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
    onTimelineViewClick: () => void;
    viewMode: 'timeline' | 'graph';
    isLabelPopupOpen: boolean;
    labelInputValue: string;
    selectedColor: LabelColor;
    onLabelInputChange: (value: string) => void;
    onColorSelect: (color: LabelColor) => void;
    labelError?: string | null;
    onConfirmLabel: () => void;
    onCloseLabelPopup: () => void;
    timelineRows: TimelineLabelRow[];
    graphData: LabelGraphPoint[];
    sessionStartTimestamp: string | null;
    latestBackendTimestamp: string | null;
    fetchDataForLabel?: (start: string, end: string) => Promise<LabelGraphPoint[]>;
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
    onTimelineViewClick,
    viewMode,
    isLabelPopupOpen,
    labelInputValue,
    selectedColor,
    onLabelInputChange,
    onColorSelect,
    labelError,
    onConfirmLabel,
    onCloseLabelPopup,
    timelineRows,
    graphData,
    sessionStartTimestamp,
    latestBackendTimestamp,
    fetchDataForLabel,
}: ComboBoxProps) {
    return (
        <div
            className={cn(
                'bg-white rounded-[30px] border-2 overflow-hidden border-[#D3D3D3]'
            )}
            style={{
                width: isExpanded ? '760px' : 'fit-content',
                minWidth: isExpanded ? '760px' : '396px',
            }}
        >
            {!isExpanded && (
                <>
                    <div className="w-full h-[70px] px-4 flex items-center justify-between transition-colors">
                        <div className="flex items-center">
                            <span
                                className={cn(
                                    'absolute left-6 w-6 h-6 rounded-full flex items-center justify-center border-[3px]',
                                    isConnected ? 'border-black' : 'border-[#D3D3D3]'
                                )}
                            >
                                {isConnected && <span className="w-3 h-3 rounded-full bg-white" />}
                            </span>

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
                            <span
                                className={cn(
                                    'absolute right-6 w-6 h-6 rounded-full flex items-center justify-center border-[3px]',
                                    isConnected ? 'border-black' : 'border-[#D3D3D3]'
                                )}
                            >
                                {isConnected && <span className="w-3 h-3 rounded-full bg-white" />}
                            </span>
                        </div>
                    </div>

                    {/* Trigger and Preview buttons */}
                    <div className="flex flex-col items-center gap-1 pb-4">
                        <div className="flex items-center gap-3">
                            <button
                                className={cn(
                                    'nodrag nopan text-lg px-4 py-1 rounded-md border transition-colors',
                                    isTriggerActive
                                        ? 'bg-white text-[#2E7B75] border-[#2E7B75]'
                                        : 'bg-[#2E7B75] text-white border-[#2E7B75]'
                                )}
                                onClick={onTriggerClick}
                            >
                                Trigger
                            </button>

                            <button
                                className="nodrag nopan text-lg px-2 py-1 rounded-md text-black hover:text-[#2E7B75] transition-colors"
                                onClick={onPreviewOpen}
                            >
                                Preview <ArrowUpRight size={16} className="inline ml-1" />
                            </button>
                        </div>

                        <span className="text-[18px] leading-none text-black mt-1">
                            {isTriggerActive ? 'Stop labeling' : 'Start labeling'}
                        </span>
                    </div>
                </>
            )}

            {isLabelPopupOpen && (
                <div className="mx-5 mb-4 rounded-[18px] border border-[#D3D3D3] bg-white p-3">
                    <div className="mb-1 flex items-center justify-between">
                        <span className="text-sm text-black">Name</span>
                        <button
                            className="nodrag nopan text-[#BFBFBF] hover:text-[#8F8F8F] transition-colors"
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
                        className={cn(
                            'nodrag nopan w-full rounded-md border px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-[#6CAFA4]',
                            labelError ? 'border-red-400' : 'border-[#E2E2E2]'
                        )}
                    />
                    {labelError && (
                        <p className="mt-1 text-xs text-red-500">{labelError}</p>
                    )}

                    <div className="mt-3 flex items-center justify-between">
                        <span className="text-sm text-black">Color</span>

                        <div className="flex items-center gap-3">
                            {(Object.keys(colorClassMap) as LabelColor[]).map((color) => {
                                const isSelected = color === selectedColor;
                                return (
                                    <button
                                        key={color}
                                        className={cn(
                                            'nodrag nopan h-5 w-5 rounded-full flex items-center justify-center transition-all',
                                            colorClassMap[color]
                                        )}
                                        onClick={() => onColorSelect(color)}
                                        aria-label={`Select ${color} label color`}
                                    >
                                        {isSelected && (
                                            <svg
                                                width="10"
                                                height="8"
                                                viewBox="0 0 10 8"
                                                fill="none"
                                                xmlns="http://www.w3.org/2000/svg"
                                            >
                                                <path
                                                    d="M1 3.5L3.5 6.5L9 1"
                                                    stroke="white"
                                                    strokeWidth="1.5"
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                />
                                            </svg>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="mt-3 flex justify-end">
                        <button
                            className="nodrag nopan rounded-md px-3 py-1 text-sm transition-colors bg-[#2E7B75] text-white hover:opacity-90"
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
                onTimelineViewClick={onTimelineViewClick}
                viewMode={viewMode}
                isConnected={isConnected}
                isDataStreamOn={isDataStreamOn}
                graphData={graphData}
                fetchDataForLabel={fetchDataForLabel}
            />
        </div>
    );
}
