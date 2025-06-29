'use client';

import { Menubar, MenubarMenu, MenubarTrigger } from '@/components/ui/menubar';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { useGlobalContext } from '@/context/GlobalContext';
import { Timer } from '@/components/ui/timer';
import { useEffect, useRef, useState } from 'react';

export default function SettingsBar() {
    const { dataStreaming, setDataStreaming } = useGlobalContext();
    const [leftTimerSeconds, setLeftTimerSeconds] = useState(0);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    // useEffect(() => {
    //     console.log('dataStreaming:', dataStreaming);
    // });
    // Timer effect - starts/stops based on dataStreaming state
    useEffect(() => {
        if (dataStreaming) {
            // Start the timer
            intervalRef.current = setInterval(() => {
                setLeftTimerSeconds(prev => prev + 1);
            }, 1000);
        } else {
            // Stop the timer
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        }

        // Cleanup on unmount
        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, [dataStreaming]);
    const handleStartStop = () => {
        setDataStreaming(!dataStreaming);
    };

    // Format seconds to MM:SS
    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="flex justify-between items-center p-4 bg-white border-b">
            {/* System Control Panel, Filters, Settings */}
            <Menubar>
                <MenubarMenu>
                    <MenubarTrigger>System Control Panel</MenubarTrigger>
                </MenubarMenu>
                <MenubarMenu>
                    <MenubarTrigger>Filters</MenubarTrigger>
                </MenubarMenu>
                <MenubarMenu>
                    <MenubarTrigger>Settings</MenubarTrigger>
                </MenubarMenu>
            </Menubar>

            {/* slider */}
            <div className="flex-1 mx-4">
                <Slider defaultValue={[50]} max={100} step={1}/>
            </div>

            {/* Timer */}
            <div className="mx-4">
                <Timer
                    leftTime={formatTime(leftTimerSeconds)}
                    rightTime="00:00"
                />
            </div>

            {/* start/stop, load, save */}
            <div className="flex space-x-2">
                <Button
                    onClick={handleStartStop}
                    className={dataStreaming ? 'bg-red-500' : 'bg-[#2E7B75]'}
                >
                    {dataStreaming ? 'Stop Data Stream' : 'Start Data Stream'}
                </Button>
                <Button variant="outline">Reset</Button>
                <Button variant="outline">Save</Button>
            </div>
        </div>
    );
}
