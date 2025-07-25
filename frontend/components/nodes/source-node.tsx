import { useGlobalContext } from '@/context/GlobalContext';
import { Handle, Position } from '@xyflow/react';
import { useState } from 'react';

export default function SourceNode() {
    const [isConnected, setIsConnected] = useState(false);
    const { dataStreaming } = useGlobalContext()

    return (
        <div
        onClick={() => setIsConnected(!isConnected)}
            className="relative w-[396px] h-[96px] flex bg-white rounded-[30px] border-2 border-[#D3D3D3] shadow-none p-0"
        >
            {/* Status dot */}
            <span
                className={`absolute left-6 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full  ${dataStreaming && isConnected ? 'bg-[#509693]' : 'bg-[#D3D3D3]'}`}
            />
            {/* Texts */}
            <div className="flex flex-col items-start justify-center ml-14">
                <span className="font-geist text-[25px] font-[550] leading-tight text-black">
                    EEG Headset
                </span>
                <span className="font-geist text-[14px] font-light leading-tight text-black mt-0">
                    Headset_001
                </span>
            </div>
            {/* Right circle */}
            <span
                className={`absolute right-6 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center border-[3px] ${isConnected ? 'border-[#000000]' : ' border-[#D3D3D3]'}`}
            >
                {isConnected && (
                    <span className="w-3 h-3 rounded-full bg-white" />
                )}
                <Handle
                    type="source"
                    position={Position.Right}
                    className="absolute mr-2 h-3 w-3 !bg-white rounded-full"
                    onConnect={() => setIsConnected(!isConnected)}
                />
            </span>
        </div>
    );
}
