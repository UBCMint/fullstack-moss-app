'use client';
import ReactFlowView from '@/components/ui-react-flow/react-flow-view';
import { GlobalProvider } from '@/context/GlobalContext';
import AppHeader from '@/components/ui-header/app-header';
import SettingsBar from '@/components/ui-header/settings-bar';

import { ErrorDialog, PermissionDialog } from '@/components/ui/custom-dialog';
import { useState } from 'react';

export default function Home() {

    // REMOVE LATER: consts for testing pop-up notifications
    const [showErrorDialog, setShowErrorDialog] = useState(false);
    const [showPermissionDialog, setShowPermissionDialog] = useState(false);

    return (
        <GlobalProvider>
            <div className="h-screen flex flex-col">
                {/* Top section for header and settings bar */}
                <div className="flex flex-col">
                    <AppHeader />
                    <SettingsBar />
                </div>

                {/* Bottom section for workspace and sidebar */}
                <div className="flex-1 flex relative">
                    <ReactFlowView />

                    {/* REMOVE LATER: Test pop-up buttons for notifications (positioned top-right corner) */}
                    <div className="absolute top-4 right-20 flex gap-2">
                        <button
                            onClick={() => setShowErrorDialog(true)}
                            className="bg-[#EB0000] text-white px-3 py-1 rounded-md"
                        >
                            Show Error
                        </button>
                        <button
                            onClick={() => setShowPermissionDialog(true)}
                            className="bg-[#2C7778] text-white px-3 py-1 rounded-md"
                        >
                            Request Permission
                        </button>
                    </div>
                </div>

                {/* REMOVE LATER: Test Dialogs for pop-up notifications*/}
                <ErrorDialog
                    open={showErrorDialog}
                    onOpenChange={setShowErrorDialog}
                    title="Save Failed: Memory Limit Exceeded"
                    description="This action has been terminated because it exceeds the configured maximum memory limit."
                />

                <PermissionDialog
                    open={showPermissionDialog}
                    onOpenChange={setShowPermissionDialog}
                    title="[Thing] Permissions"
                    description="We need access to ................."
                    onAllow={() => {
                        console.log('Permission granted');
                        setShowPermissionDialog(false);
                    }}
                />

            </div>
        </GlobalProvider>
    );
}
