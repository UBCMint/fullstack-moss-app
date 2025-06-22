'use client';

import { Menubar, MenubarMenu, MenubarTrigger } from '@/components/ui/menubar';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { useGlobalContext } from '@/context/GlobalContext';

export default function SettingsBar() {
    const { dataStreaming, setDataStreaming } = useGlobalContext();

    // useEffect(() => {
    //     console.log('dataStreaming:', dataStreaming);
    // });

    const handleStartStop = () => {
        setDataStreaming(!dataStreaming);
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
                <Slider defaultValue={[50]} max={100} step={1} />
            </div>

            {/* start/stop, load, save */}
            <div className="flex space-x-2">
                <Button
                    onClick={handleStartStop}
                    className={dataStreaming ? 'bg-red-500' : 'bg-green-500'}
                >
                    {dataStreaming ? 'Stop Data Stream' : 'Start Data Stream'}
                </Button>
                <Button variant="outline">Load</Button>
                <Button variant="outline">Save</Button>
            </div>
        </div>
    );
}
