// TO DELETE - just for reference for now
import * as React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

export type LabelCategory = 'event-based' | 'state-based';

const categories: { value: LabelCategory; label: string }[] = [
    { value: 'event-based', label: 'Event-based' },
    { value: 'state-based', label: 'State-based' },
];

const handleTriggerClick = () => {
    console.log('Trigger clicked');
};

interface ComboBoxProps {
    value?: LabelCategory;
    onValueChange?: (value: LabelCategory) => void;
    isConnected?: boolean;
    isDataStreamOn?: boolean;
}

export default function ComboBox({
    value,
    onValueChange,
    isConnected = false,
    isDataStreamOn = false,
}: ComboBoxProps) {
    const [isExpanded, setIsExpanded] = React.useState(false);
    const titleRef = React.useRef<HTMLSpanElement>(null);
    const [selectedCategory, setSelectedCategory] =
        React.useState<LabelCategory>(value ?? 'event-based');
    
    const toggleExpanded = () => {
        setIsExpanded(!isExpanded);
    };

    const handleOptionSelect = (optionValue: LabelCategory) => {
        setSelectedCategory(optionValue);
        onValueChange?.(optionValue);
        // Add animation delay before closing
        setTimeout(() => {
            setIsExpanded(false);
        }, 100);
    };

    React.useEffect(() => {
        if (value) {
            setSelectedCategory(value);
        }
    }, [value]);

    return (
        <div
            className={cn(
                'bg-white rounded-[30px] border-2 overflow-hidden border-[#D3D3D3]'
            )}
            style={{ 
                width: 'fit-content', 
                minWidth: '396px' }}
        >
            <button
                onClick={toggleExpanded}
                className="w-full h-[70px] px-4 flex items-center justify-between transition-colors"
            >
                <div className="flex items-center">
                    <div
                        className={cn(
                            'absolute left-6 w-6 h-6 rounded-full border-[3px] flex items-center justify-center bg-white',
                            isConnected 
                                ? 'border-black' 
                                : 'border-gray-300',
                            { /* TODO: Connected to source AND data stream on: black border (activated) */ }
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

                    {/* Labeling text - larger, bold font with ref for measurement */}
                    <span 
                        ref={titleRef}
                        className="absolute left-24 font-geist text-[25px] font-[550] leading-tight text-black tracking-wider"
                    >
                        Labeling Node
                    </span>
                    {/* TODO: Add the selected category label here */}
                </div>

                {/* Toggle arrow */}  
                <div className="flex items-center space-x-3">
                    <div className="absolute right-[58px] transition-transform duration-300 ease-in-out">
                        {isExpanded ? (
                            <ChevronUp className="h-5 w-5 text-gray-600" />
                        ) : (
                            <ChevronDown className="h-5 w-5 text-gray-600" />
                        )}
                    </div>

                    {/* Right connection circle - changes based on connection and data stream */}
                    <div
                        className={cn(
                            'absolute right-6 w-6 h-6 rounded-full border-[3px] flex items-center justify-center bg-white',
                            isConnected ? 'border-black' : 'border-gray-300'
                        )}
                    />
                </div>
            </button>

            {/* TODO: slider row, for this one would be button when not expanded. center button, add space below button */}
            {/* TODO: print the label for the selected category, not value */}
            {!isExpanded && (
                <div className="flex justify-center mb-1">
                    <span className="text-lg text-black">Category: {categories.find((category) => category.value === selectedCategory)?.label}</span>
                </div>
            )}
            {!isExpanded && (
                <div className="flex justify-center mb-3">
                    <button 
                        className="mt-1 bg-[#2E7B75] text-white text-lg px-3 py-1 rounded-md"
                        onClick={handleTriggerClick}
                    >
                        Trigger
                    </button>
                </div>
            )}

            {/* Expandable options section */}
            <div
                className="overflow-hidden"
                style={{
                    maxHeight: isExpanded ? '120px' : '0px',
                    opacity: isExpanded ? 1 : 0,
                    transition:
                        'max-height 0.3s ease-in-out, opacity 0.3s ease-in-out',
                }}
            >
                <div
                    className="space-y-0.5 flex flex-col"
                    style={{ 
                        paddingLeft: '60px', 
                        paddingRight: '60px',
                        paddingBottom: '8px',
                    }}
                >
                    <div className="text-xs text-gray-500">Categories</div>

                    {categories.map((category) => (
                        <button
                            key={category.value}
                            onClick={() => handleOptionSelect(category.value)}
                            className={cn(
                                'text-left px-3 py-0 text-xs font-normal rounded-lg transition-colors',
                                'block w-full',
                                selectedCategory === category.value
                                    ? 'bg-gray-100 text-gray-900'
                                    : 'text-gray-700 hover:bg-gray-50'
                            )}
                        >
                            {category.label}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
