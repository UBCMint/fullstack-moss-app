import { useGlobalContext } from '@/context/GlobalContext';
import { Handle, Position } from '@xyflow/react';

interface SourceNodeProps {
    selected?: boolean;
}

export default function SourceNode({ selected }: SourceNodeProps) {
    const { dataStreaming } = useGlobalContext();

    return (
        <div
            className={`relative w-[396px] h-[96px] flex bg-white rounded-[30px] border-2 shadow-none p-0 transition-colors ${
                selected
                    ? 'border-[#2E7B75] shadow-[0_0_0_3px_rgba(46,123,117,0.25)]'
                    : 'border-[#D3D3D3]'
            }`}
        >
            {/* Status dot */}
            <span
                className={`absolute left-6 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full ${dataStreaming ? 'bg-[#509693]' : 'bg-[#D3D3D3]'}`}
            />

            {/* Texts */}
            <div className="flex flex-col items-start justify-center ml-14">
                <span className="font-geist text-[25px] font-[550] leading-tight text-black tracking-wider">
                    EEG Headset
                </span>
                <span className="font-geist text-[14px] font-normal leading-tight text-black mt-0">
                    Headset_001
                </span>
            </div>

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
    );
}
