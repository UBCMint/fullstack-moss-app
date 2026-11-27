'use client';
import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useGlobalContext } from '@/context/GlobalContext';
import { useWebSocketContext } from '@/context/WebSocketContext';
import type {
    ChannelIssue,
    QualityLevel,
    QualityReport,
    QualitySignal,
} from '@/lib/pipeline';
import { useNodeConnection } from '../use-node-connection';

// Ella's EEG & EMG Signal Quality frames (task 35); the red error card is from her older
// designs. Rules for the levels are in backend/docs/pipeline-nodes.md (`signal_quality`).

const GREEN = '#00BE26';
const ORANGE = '#FF9500';
const RED = '#EB0000';
const GREY = '#D3D3D3';

const LEVELS: Record<
    Exclude<QualityLevel, 'no_signal'>,
    { label: string; dots: string[] }
> = {
    strong: { label: 'Strong', dots: [GREEN, GREEN, GREEN] },
    moderate: { label: 'Moderate', dots: [ORANGE, ORANGE, GREY] },
    poor: { label: 'Poor', dots: [RED, GREY, GREY] },
};

const ISSUE_TEXT: Record<ChannelIssue, string> = {
    empty: 'no data',
    flatline: 'flat signal',
    railing: 'signal out of range',
    line_noise: '60 Hz noise',
};

const COPY: Record<
    QualitySignal,
    { title: string; noSignal: string; fix: React.ReactNode }
> = {
    eeg: {
        title: 'EEG Signal Quality',
        noSignal: 'No EEG signal detected.',
        fix: (
            <>
                <p>To improve signal quality:</p>
                <ul className="list-disc pl-5">
                    <li>Apply saline spray</li>
                    <li>Clear hair from electrodes</li>
                    <li>Increase electrode pressure</li>
                </ul>
            </>
        ),
    },
    emg: {
        title: 'EMG Signal Quality',
        noSignal: 'No EMG signal detected.',
        fix: (
            <p>Please check that the sensor is firmly attached to the skin.</p>
        ),
    },
};

const handleStyle = (side: 'left' | 'right'): React.CSSProperties => ({
    [side]: '24px',
    top: '45px',
    transform: 'translateY(-50%)',
    width: '32px',
    height: '32px',
    backgroundColor: 'transparent',
    border: '2px solid transparent',
    borderRadius: '50%',
    zIndex: 20,
    cursor: 'crosshair',
    pointerEvents: 'all',
});

// "Channel 3 (flat signal)": channels are shown 1-based
const describeFailing = (report: QualityReport) =>
    report.channels
        .filter((c) => c.issues.length > 0)
        .map(
            (c) =>
                `Channel ${c.channel + 1} (${c.issues.map((i) => ISSUE_TEXT[i]).join(', ')})`
        )
        .join(', ');

interface SignalQualityNodeProps {
    id: string;
    selected?: boolean;
}

function SignalQualityNode({
    id,
    selected,
    signal,
}: SignalQualityNodeProps & { signal: QualitySignal }) {
    const { connected } = useNodeConnection(id);
    const { dataStreaming } = useGlobalContext();
    const { subscribeQuality } = useWebSocketContext();
    const [report, setReport] = React.useState<QualityReport | null>(null);
    const [dismissed, setDismissed] = React.useState(false);

    React.useEffect(
        () =>
            subscribeQuality((reports) => {
                const mine = reports.find((r) => r.node_id === id);
                if (mine) setReport(mine);
            }),
        [id, subscribeQuality]
    );

    // the status is only true while data is flowing
    React.useEffect(() => {
        if (!dataStreaming) setReport(null);
    }, [dataStreaming]);

    const level = connected && dataStreaming ? report?.level : undefined;

    // show the error again whenever the signal recovers and drops out again
    React.useEffect(() => {
        if (level !== 'no_signal') setDismissed(false);
    }, [level]);

    const copy = COPY[signal];
    const showError = level === 'no_signal' && !dismissed;
    const status = level && level !== 'no_signal' ? LEVELS[level] : null;

    return (
        <div
            className={cn(
                'relative w-[396px] min-h-[90px] bg-white rounded-[30px] border-2 transition-all duration-300 ease-in-out',
                showError
                    ? 'border-[#EB0000]'
                    : selected
                      ? 'border-[#2E7B75] shadow-[0_0_0_3px_rgba(46,123,117,0.25)]'
                      : 'border-[#D3D3D3]'
            )}
        >
            <Handle
                type="target"
                position={Position.Left}
                id={`${signal}-quality-input`}
                style={handleStyle('left')}
            />
            <Handle
                type="source"
                position={Position.Right}
                id={`${signal}-quality-output`}
                style={handleStyle('right')}
            />

            {/* header: circles, status dot, title */}
            <div className="relative h-[90px]">
                <div
                    className={cn(
                        'absolute left-6 top-[29px] w-8 h-8 rounded-full border-[3px] bg-white',
                        connected ? 'border-black' : 'border-[#D3D3D3]'
                    )}
                />
                <div
                    className={cn(
                        'absolute left-16 top-[39px] w-3 h-3 rounded-full',
                        connected && dataStreaming
                            ? 'bg-[#509693]'
                            : 'bg-[#D3D3D3]'
                    )}
                />
                <span className="absolute left-24 top-1/2 -translate-y-1/2 font-geist text-[25px] font-[550] leading-tight text-black tracking-wider">
                    {copy.title}
                </span>
                <div
                    className={cn(
                        'absolute right-6 top-[29px] w-8 h-8 rounded-full border-[3px] bg-white',
                        connected ? 'border-black' : 'border-[#D3D3D3]'
                    )}
                />
            </div>

            {status && report && (
                <div className="-mt-5 pb-4 px-6 flex flex-col items-center">
                    <div
                        className="flex items-center gap-2"
                        role="status"
                        aria-label={`${copy.title}: ${status.label}`}
                    >
                        {status.dots.map((color, i) => (
                            <span
                                key={i}
                                className="w-4 h-4 rounded-full"
                                style={{ backgroundColor: color }}
                            />
                        ))}
                        <span className="ml-1 text-[18px] text-black">
                            {status.label}
                        </span>
                    </div>

                    {level === 'poor' && (
                        <div className="mt-3 flex items-start gap-2 text-[16px] leading-5 text-black">
                            <AlertCircle
                                className="mt-0.5 h-5 w-5 shrink-0"
                                style={{ color: RED }}
                            />
                            <div>
                                {copy.fix}
                                <p className="mt-1 text-[14px] text-gray-600">
                                    {describeFailing(report)}
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {showError && (
                <div className="-mt-5 pb-5 px-6 flex flex-col items-center">
                    <div
                        role="alert"
                        className="flex items-start gap-2 text-[16px] leading-5 text-black"
                    >
                        <span
                            className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white"
                            style={{ backgroundColor: RED }}
                        >
                            !
                        </span>
                        <div>
                            <p>{copy.noSignal}</p>
                            <div className="mt-2">{copy.fix}</div>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => setDismissed(true)}
                        className="nodrag mt-4 px-4 py-2 rounded-xl bg-[#2B6C66] text-white font-semibold text-[16px]"
                    >
                        Okay
                    </button>
                </div>
            )}
        </div>
    );
}

export function EegQualityNode(props: SignalQualityNodeProps) {
    return <SignalQualityNode {...props} signal="eeg" />;
}

export function EmgQualityNode(props: SignalQualityNodeProps) {
    return <SignalQualityNode {...props} signal="emg" />;
}
