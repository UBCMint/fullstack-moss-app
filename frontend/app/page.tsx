'use client';
import ReactFlowView from '@/components/ui-react-flow/react-flow-view';
import { GlobalProvider } from '@/context/GlobalContext';
import AppHeader from '@/components/ui-header/app-header';
import SettingsBar from '@/components/ui-header/settings-bar';

export default function Home() {
    return (
        <GlobalProvider>
            <div className="h-screen flex flex-col">
                {/* Top section for header and settings bar */}
                <div className="flex flex-col">
                    <AppHeader />
                    <SettingsBar />
                </div>

                {/* Bottom section for workspace and sidebar */}
                <div className="flex-1 flex">
                    <ReactFlowView />
                </div>
            </div>
        </GlobalProvider>
    );
}
