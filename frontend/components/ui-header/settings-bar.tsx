'use client';

import { Menubar } from '@/components/ui/menubar';
import { Plus } from 'lucide-react';
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
    const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
    const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
    const [sessionModalMode, setSessionModalMode] = useState<'save' | 'load'>(
        'save'
    );
    const [sessions, setSessions] = useState<SessionSummary[]>([]);
    const [isFetchingSessions, setIsFetchingSessions] = useState(false);
    const [fetchingFor, setFetchingFor] = useState<'save' | 'load' | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isDirty, setIsDirty] = useState(false);
    const [isLoadWarningOpen, setIsLoadWarningOpen] = useState(false);
    const [activeSessionName, setActiveSessionName] = useState<string | null>(null);

    // Track unsaved canvas changes
    useEffect(() => {
        const handler = () => setIsDirty(true);
        window.addEventListener('canvas-changed', handler);
        window.addEventListener('reactflow-edges-changed', handler);
        return () => {
            window.removeEventListener('canvas-changed', handler);
            window.removeEventListener('reactflow-edges-changed', handler);
        };
    }, []);

    // Auto-create an unsaved session on app open so streaming is always available.
    // The "(unsaved)" prefix keeps it out of the load/save lists.
    useEffect(() => {
        if (activeSessionId !== null) return;
        createSession(`(unsaved) ${new Date().toISOString()}`)
            .then((s) => { setActiveSessionId(s.id); setActiveSessionName(null); })
            .catch((e) => console.error('Failed to auto-create session:', e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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
        setDataStreaming(false);
        setLeftTimerSeconds(0);
        window.dispatchEvent(new Event('pipeline-reset'));
        setIsDirty(true);
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
                setIsDirty(false);
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
            setSessions(fetchedSessions.filter(
                (s) => !s.name.startsWith('Label Session ') && !s.name.startsWith('(unsaved) ') && !s.name.startsWith('Session ')
            ));
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

    const openLoadModal = async () => {
        setIsFetchingSessions(true);
        setFetchingFor('load');
        try {
            const fetchedSessions = await getSessions();
            // Filter out orphaned label-node sessions created by old code.
            setSessions(fetchedSessions.filter(
                (s) => !s.name.startsWith('Label Session ') && !s.name.startsWith('(unsaved) ') && !s.name.startsWith('Session ')
            ));
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

    const handleLoadClick = () => {
        if (isSaving || isLoading || isFetchingSessions) return;
        if (isDirty) {
            setIsLoadWarningOpen(true);
        } else {
            void openLoadModal();
        }
    };

    const handleNewClick = () => {
        if (isSaving || isLoading || isFetchingSessions) {
            return;
        }
        if (isDirty) {
            setIsNewDialogOpen(true);
        } else {
            handleConfirmNew();
        }
    };

    const handleConfirmNew = () => {
        setActiveSessionId(null);
        setIsDirty(false);
        setDataStreaming(false);
        setLeftTimerSeconds(0);
        window.dispatchEvent(new Event('pipeline-reset'));
        setIsNewDialogOpen(false);
        createSession(`(unsaved) ${new Date().toISOString()}`)
            .then((s) => {
                setActiveSessionId(s.id);
                setActiveSessionName(null);
                notifications.success({ title: 'New session started' });
            })
            .catch(() => notifications.error({ title: 'Could not create session' }));
    };

    const handleCreateAndSaveSession = async (sessionName: string) => {
        setIsSaving(true);
        try {
            const state = await requestFrontendState();
            const createdSession = await createSession(sessionName);
            await saveFrontendState(createdSession.id, state);
            setActiveSessionId(createdSession.id);
            setIsDirty(false);
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
            {/* Session ID, Tutorials */}
            <Menubar>
                <span className="px-3 py-1 text-sm">
                    Session {activeSessionId ?? 'ID'}
                </span>
                <button className="px-3 py-1 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground hover:underline">
                    Tutorials
                </button>
            </Menubar>

            {/* New session button */}
            <Button
                variant="outline"
                onClick={handleNewClick}
                disabled={isSaving || isLoading || isFetchingSessions}
                className="ml-2 flex items-center gap-1"
            >
                <Plus size={14} />
                New
            </Button>

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


            {/* start/stop, reset, import, export, save, load */}
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

            <Dialog open={isNewDialogOpen} onOpenChange={setIsNewDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Start a new session?</DialogTitle>
                        <DialogDescription>
                            Your current session is unsaved. Hitting confirm will clear the current pipeline. Any unsaved changes will be lost.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex justify-end gap-2 mt-4">
                        <DialogClose asChild>
                            <Button variant="outline">Cancel</Button>
                        </DialogClose>
                        <Button className="bg-red-500" onClick={handleConfirmNew}>Confirm</Button>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={isLoadWarningOpen} onOpenChange={setIsLoadWarningOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Load a different session?</DialogTitle>
                        <DialogDescription>
                            Your current session has unsaved changes. Loading a new session will discard them. Save first if you want to keep your work.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex justify-end gap-2 mt-4">
                        <DialogClose asChild>
                            <Button variant="outline">Cancel</Button>
                        </DialogClose>
                        <Button
                            className="bg-red-500"
                            onClick={() => {
                                setIsLoadWarningOpen(false);
                                void openLoadModal();
                            }}
                        >
                            Discard & Load
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

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
