'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { SessionSummary } from '@/lib/session-api';

type SessionModalMode = 'save' | 'load';

type SessionModalProps = {
    open: boolean;
    mode: SessionModalMode;
    sessions: SessionSummary[];
    isSubmitting?: boolean;
    onOpenChange: (open: boolean) => void;
    onSave: (sessionName: string) => Promise<void> | void;
    onLoad: (sessionId: number) => Promise<void> | void;
};

export default function SessionModal({
    open,
    mode,
    sessions,
    isSubmitting = false,
    onOpenChange,
    onSave,
    onLoad,
}: SessionModalProps) {
    const [sessionName, setSessionName] = useState('');
    const [selectedSessionId, setSelectedSessionId] = useState<number | null>(
        null
    );
    const [validationError, setValidationError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) {
            setSessionName('');
            setSelectedSessionId(null);
            setValidationError(null);
        }
    }, [open, mode]);

    const normalizedExistingNames = useMemo(
        () => new Set(sessions.map((session) => session.name.trim().toLowerCase())),
        [sessions]
    );

    const selectedSession = useMemo(
        () =>
            selectedSessionId === null
                ? null
                : sessions.find((session) => session.id === selectedSessionId) || null,
        [selectedSessionId, sessions]
    );

    const handleSave = async () => {
        const trimmed = sessionName.trim();
        if (!trimmed) {
            setValidationError('Session name is required.');
            return;
        }

        if (normalizedExistingNames.has(trimmed.toLowerCase())) {
            setValidationError('Session name must be unique.');
            return;
        }

        setValidationError(null);
        await onSave(trimmed);
    };

    const handleLoad = async () => {
        if (selectedSessionId === null) {
            setValidationError('Select a session to load.');
            return;
        }

        setValidationError(null);
        await onLoad(selectedSessionId);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>
                        {mode === 'save' ? 'Save Session' : 'Load Session'}
                    </DialogTitle>
                    <DialogDescription>
                        {mode === 'save'
                            ? 'Enter a unique name for this session.'
                            : 'Select an existing session by name or ID.'}
                    </DialogDescription>
                </DialogHeader>

                {mode === 'save' ? (
                    <div className="space-y-2">
                        <input
                            value={sessionName}
                            onChange={(event) => setSessionName(event.target.value)}
                            placeholder="Session name"
                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={isSubmitting}
                        />
                        {validationError ? (
                            <p className="text-sm text-red-600">{validationError}</p>
                        ) : null}
                    </div>
                ) : (
                    <div className="space-y-2">
                        <Command className="border rounded-md">
                            <CommandInput placeholder="Search by name or session ID..." />
                            <CommandList>
                                <CommandEmpty>No sessions found.</CommandEmpty>
                                <CommandGroup>
                                    {sessions.map((session) => (
                                        <CommandItem
                                            key={session.id}
                                            value={`${session.name} ${session.id}`}
                                            onSelect={() => setSelectedSessionId(session.id)}
                                            disabled={isSubmitting}
                                        >
                                            <Check
                                                className={cn(
                                                    'mr-2 h-4 w-4',
                                                    selectedSessionId === session.id
                                                        ? 'opacity-100'
                                                        : 'opacity-0'
                                                )}
                                            />
                                            <span>{session.name}</span>
                                            <span className="ml-auto text-xs text-muted-foreground">
                                                ID {session.id}
                                            </span>
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            </CommandList>
                        </Command>
                        {validationError ? (
                            <p className="text-sm text-red-600">{validationError}</p>
                        ) : null}
                    </div>
                )}

                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={isSubmitting}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={mode === 'save' ? handleSave : handleLoad}
                        disabled={
                            isSubmitting ||
                            (mode === 'load' && sessions.length === 0)
                        }
                    >
                        {isSubmitting
                            ? mode === 'save'
                                ? 'Saving...'
                                : 'Loading...'
                            : mode === 'save'
                              ? 'Save'
                              : 'Load'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

