'use client';
import ReactFlowView from '@/components/ui-react-flow/react-flow-view';
import { GlobalProvider } from '@/context/GlobalContext';
import { WebSocketProvider } from '@/context/WebSocketContext';
import AppHeader from '@/components/ui-header/app-header';
import SettingsBar from '@/components/ui-header/settings-bar';
import { NotificationsProvider } from '@/components/notifications';

export default function Home() {
    return (
        <GlobalProvider>
            <WebSocketProvider>
                <NotificationsProvider>
                    <div className="h-screen flex flex-col overflow-hidden">
                        {/* Top section for header and settings bar */}
                        <div className="flex shrink-0 flex-col">
                            <AppHeader />
                            <SettingsBar />
                        </div>

                        {/* Bottom section for workspace and sidebar */}
                        <div className="relative flex min-h-0 flex-1">
                            <ReactFlowView />
                        </div>
                    </div>
                </NotificationsProvider>
            </WebSocketProvider>
        </GlobalProvider>
    );
}
