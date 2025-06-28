import { Handle, Position } from '@xyflow/react';
import { useState } from 'react';

export default function SourceNode() {
    // For demo: toggle this to see connected/disconnected states
    const [isConnected] = useState(false); // set to true for connected state

    return (
        <div className="relative w-[370px] h-[120px] flex items-center justify-center bg-white rounded-[2.5rem] border-2 border-[#D3D3D3] shadow-none p-0">
            {/* React Flow handle */}
            <Handle type="source" position={Position.Bottom} style={{ left: '50%', background: 'transparent', border: 'none' }} />
            {/* Status dot */}
            <span
                className={`absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full border border-[#D3D3D3] ${isConnected ? 'bg-teal-500 border-teal-500' : 'bg-[#D3D3D3]'}`}
            />
            {/* Texts */}
            <div className="flex flex-col items-start justify-center ml-0">
                <span className="font-geist text-[2.2rem] font-bold leading-tight text-black">EEG Headset</span>
                <span className="font-geist text-[1.3rem] font-normal leading-tight text-black mt-0">Headset_001</span>
            </div>
            {/* Right circle */}
            <span
                className={`absolute right-6 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center ${isConnected ? 'border-2 border-black' : 'border-2 border-[#D3D3D3]'}`}
            >
                {isConnected && <span className="w-5 h-5 rounded-full bg-black" />}
            </span>
        </div>
    );
}
