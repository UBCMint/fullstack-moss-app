'use client';

import { Menubar, MenubarMenu, MenubarTrigger } from '@/components/ui/menubar';
import { ProgressBar } from '@/components/ui/progressbar';
import { Button } from '@/components/ui/button';
import { useGlobalContext } from '@/context/GlobalContext';
import { Timer } from '@/components/ui/timer';
import { useEffect, useRef, useState } from 'react';
import SessionModal from '@/components/ui-sessions/session-modal';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogClose,
} from '@/components/ui/dialog';
import { useNotifications } from '@/components/notifications';
import {
    createSession,
    getSessions,
    loadFrontendState,
    saveFrontendState,
    SessionSummary,
} from '@/lib/session-api';
import {
    FrontendWorkspaceState,
    isFrontendWorkspaceState,
} from '@/lib/frontend-state';

export default function SettingsBar() {
    const {
        dataStreaming,
        setDataStreaming,
        activeSessionId,
        setActiveSessionId,
    } = useGlobalContext();
    const notifications = useNotifications();
    const [leftTimerSeconds, setLeftTimerSeconds] = useState(0);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
    const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
    const [sessionModalMode, setSessionModalMode] = useState<'save' | 'load'>(
        'save'
    );
    const [sessions, setSessions] = useState<SessionSummary[]>([]);
    const [isFetchingSessions, setIsFetchingSessions] = useState(false);
    const [fetchingFor, setFetchingFor] = useState<'save' | 'load' | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

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
    }, [leftTimerSeconds, dataStreaming, setDataStreaming]);


    const handleStartStop = () => {
        setDataStreaming(!dataStreaming);
    };

    const handleConfirmReset = () => {
        // Stop the data stream and reset the timer
        setDataStreaming(false);
        setLeftTimerSeconds(0);

        // Broadcast a reset event so the flow view can clear nodes/edges
        try {
            window.dispatchEvent(new Event('pipeline-reset'));
        } catch (_) {
            // no-op if window is unavailable
        }

        setIsResetDialogOpen(false);
    };

    const requestFrontendState = async (): Promise<FrontendWorkspaceState> =>
        new Promise((resolve, reject) => {
            const timeout = window.setTimeout(() => {
                reject(new Error('Timed out while collecting frontend state.'));
            }, 4000);

            const responseListener = (event: Event) => {
                window.clearTimeout(timeout);
                const customEvent = event as CustomEvent<unknown>;
                if (!isFrontendWorkspaceState(customEvent.detail)) {
                    reject(new Error('Frontend state payload is invalid.'));
                    return;
                }
                resolve(customEvent.detail);
            };

            window.addEventListener('frontend-state-response', responseListener, {
                once: true,
            });
            window.dispatchEvent(new Event('request-frontend-state'));
        });

    const getErrorMessage = (error: unknown) =>
        error instanceof Error ? error.message : 'Unexpected error';

    const handleSaveToExistingSession = async (sessionId: number) => {
        const state = await requestFrontendState();
        await saveFrontendState(sessionId, state);
    };

    const handleSaveClick = async () => {
        if (isSaving || isLoading || isFetchingSessions) {
            return;
        }

        if (activeSessionId !== null) {
            setIsSaving(true);
            try {
                await handleSaveToExistingSession(activeSessionId);
                notifications.success({ title: 'Session saved successfully' });
            } catch (error) {
                notifications.error({
                    title: 'Save failed',
                    description: getErrorMessage(error),
                });
            } finally {
                setIsSaving(false);
            }
            return;
        }

        setIsFetchingSessions(true);
        setFetchingFor('save');
        try {
            const fetchedSessions = await getSessions();
            setSessions(fetchedSessions);
            setSessionModalMode('save');
            setIsSessionModalOpen(true);
        } catch (error) {
            notifications.error({
                title: 'Save failed',
                description: getErrorMessage(error),
            });
        } finally {
            setIsFetchingSessions(false);
            setFetchingFor(null);
        }
    };

    const handleLoadClick = async () => {
        if (isSaving || isLoading || isFetchingSessions) {
            return;
        }

        setIsFetchingSessions(true);
        setFetchingFor('load');
        try {
            const fetchedSessions = await getSessions();
            setSessions(fetchedSessions);
            setSessionModalMode('load');
            setIsSessionModalOpen(true);
        } catch (error) {
            notifications.error({
                title: 'Load failed',
                description: getErrorMessage(error),
            });
        } finally {
            setIsFetchingSessions(false);
            setFetchingFor(null);
        }
    };

    const handleCreateAndSaveSession = async (sessionName: string) => {
        setIsSaving(true);
        try {
            const state = await requestFrontendState();
            const createdSession = await createSession(sessionName);
            await saveFrontendState(createdSession.id, state);
            setActiveSessionId(createdSession.id);
            setIsSessionModalOpen(false);
            notifications.success({ title: 'Session saved successfully' });
        } catch (error) {
            notifications.error({
                title: 'Save failed',
                description: getErrorMessage(error),
            });
        } finally {
            setIsSaving(false);
        }
    };

    const handleLoadSession = async (sessionId: number) => {
        setIsLoading(true);
        try {
            const loadedPayload = await loadFrontendState(sessionId);
            if (!isFrontendWorkspaceState(loadedPayload)) {
                throw new Error('Loaded session payload has an invalid format.');
            }

            window.dispatchEvent(
                new CustomEvent('restore-frontend-state', {
                    detail: loadedPayload,
                })
            );
            setActiveSessionId(sessionId);
            setIsSessionModalOpen(false);
            notifications.success({ title: 'Session loaded successfully' });
        } catch (error) {
            notifications.error({
                title: 'Load failed',
                description: getErrorMessage(error),
            });
        } finally {
            setIsLoading(false);
        }
    };

    // Format seconds to MM:SS
    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="flex justify-between items-center p-4 bg-white border-b">
            {/* System Control Panel, Settings */}
            <Menubar>
                <MenubarMenu>
                    <MenubarTrigger>System Control Panel</MenubarTrigger>
                </MenubarMenu>
                <MenubarMenu>
                    <MenubarTrigger>Settings</MenubarTrigger>
                </MenubarMenu>
            </Menubar>

            {/* slider */}
            <div className="flex-1 mx-4">
                <ProgressBar value={(leftTimerSeconds / 300) * 100} />
            </div>

            {/* Timer */}
            <div className="pr-4">
                <Timer
                    leftTime={formatTime(leftTimerSeconds)}
                    rightTime="05:00"
                />
            </div>


            {/* start/stop, reset, save, load */}
            <div className="flex space-x-2">
                <Button
                    onClick={handleStartStop}
                    className={dataStreaming ? 'bg-red-500' : 'bg-[#2E7B75]'}
                >
                    {dataStreaming ? 'Stop Data Stream' : 'Start Data Stream'}
                </Button>
                <Dialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
                    <DialogTrigger asChild>
                        <Button variant="outline">Reset</Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Clear current pipeline?</DialogTitle>
                            <DialogDescription>
                                This will stop the running stream and remove all nodes and edges. This action cannot be undone.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="flex justify-end gap-2 mt-4">
                            <DialogClose asChild>
                                <Button variant="outline">Cancel</Button>
                            </DialogClose>
                            <Button className="bg-red-500" onClick={handleConfirmReset}>Confirm Reset</Button>
                        </div>
                    </DialogContent>
                </Dialog>
                <Button
                    variant="outline"
                    onClick={handleSaveClick}
                    disabled={isSaving || isLoading || isFetchingSessions}
                >
                    {isSaving
                        ? 'Saving...'
                        : fetchingFor === 'save'
                          ? 'Preparing...'
                          : 'Save'}
                </Button>
                <Button
                    variant="outline"
                    onClick={handleLoadClick}
                    disabled={isSaving || isLoading || isFetchingSessions}
                >
                    {isLoading
                        ? 'Loading...'
                        : fetchingFor === 'load'
                          ? 'Preparing...'
                          : 'Load'}
                </Button>
            </div>

            <SessionModal
                open={isSessionModalOpen}
                mode={sessionModalMode}
                sessions={sessions}
                isSubmitting={isSaving || isLoading}
                onOpenChange={setIsSessionModalOpen}
                onSave={handleCreateAndSaveSession}
                onLoad={handleLoadSession}
            />
        </div>
    );
}
