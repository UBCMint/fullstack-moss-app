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
                setLeftTimerSeconds(prev => {
                    if (prev >= 300) return 300; // Cap at 300 seconds (5 minutes)
                    return prev + 1;
                });
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

    // Stop the stream if timer hits 300 seconds (5 minutes)
    useEffect(() => {
        if (leftTimerSeconds >= 300 && dataStreaming) {
            setDataStreaming(false);
        }
    }, [leftTimerSeconds, dataStreaming]);


    const handleStartStop = () => {
        setDataStreaming(!dataStreaming);
    };

    const handleReset = () => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current)
            intervalRef.current = null
        }
        setLeftTimerSeconds(0)
        setDataStreaming(false)
    }


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
                <Slider
                    value={[(leftTimerSeconds / 300) * 100]}
                    max={100}
                    step={1}
                    disabled
                />
            </div>

            {/* Timer */}
            <div className="mx-4">
                <Timer
                    leftTime={formatTime(leftTimerSeconds)}
                    rightTime="05:00"
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
                <Button variant="outline" onClick={handleReset}>Reset</Button>
                <Button variant="outline">Save</Button>
            </div>
        </div>
    );
}
