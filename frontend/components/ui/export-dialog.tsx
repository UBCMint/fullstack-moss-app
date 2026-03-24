'use client';

import { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useNotifications } from '@/components/notifications';
import { exportEEGData, downloadCSV } from '@/lib/eeg-api';
import { ExitIcon } from '@radix-ui/react-icons';

type ExportDialogProps = {
    open: boolean;
    sessionId: number | null;
    onOpenChange: (open: boolean) => void;
};

export default function ExportDialog({
    open,
    sessionId,
    onOpenChange,
}: ExportDialogProps) {
    const notifications = useNotifications();
    const [exportMode, setExportMode] = useState<'range' | 'all'>('range');
    const [durationValue, setDurationValue] = useState('30');
    const [durationUnit, setDurationUnit] = useState('Minutes');
    const [isExporting, setIsExporting] = useState(false);

    const handleClose = () => {
        if (!isExporting) {
            onOpenChange(false);
        }
    };

    const handleExport = async () => {
        if (sessionId === null) {
            notifications.error({
                title: 'No active session',
                description: 'Please start or load a session before exporting.',
            });
            return;
        }

        const options: Record<string, string> = {};

        if (exportMode === 'range') {
            const value = parseFloat(durationValue);
            if (isNaN(value) || value <= 0) {
                notifications.error({
                    title: 'Invalid duration',
                    description: 'Please enter a valid number greater than 0.',
                });
                return;
            }

            let multiplier = 1000;
            if (durationUnit === 'Minutes') multiplier = 60 * 1000;
            if (durationUnit === 'Hours') multiplier = 60 * 60 * 1000;
            if (durationUnit === 'Days') multiplier = 24 * 60 * 60 * 1000;

            const now = new Date();
            options.start_time = new Date(now.getTime() - value * multiplier).toISOString();
            options.end_time = now.toISOString();
        }

        setIsExporting(true);
        try {

            const csvContent = await exportEEGData(sessionId, options);
            downloadCSV(csvContent, sessionId);
            notifications.success({ title: 'EEG data exported successfully' });
            onOpenChange(false);
        } catch (error) {
            notifications.error({
                title: 'Export failed',
                description:
                    error instanceof Error ? error.message : 'Unexpected error',
            });
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-[400px] p-8">
                <DialogHeader className="mb-4 text-left">
                    <DialogTitle className="flex items-center text-2xl font-bold mb-2">
                        <ExitIcon className="mr-2" width={24} height={24} />
                        Export Data
                    </DialogTitle>
                </DialogHeader>

                <div className="py-2">
                    {/* Mode toggle */}
                    <div className="flex rounded-lg border border-gray-200 overflow-hidden mb-4">
                        <button
                            type="button"
                            onClick={() => setExportMode('range')}
                            disabled={isExporting}
                            className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${exportMode === 'range' ? 'bg-gray-900 text-white' : 'bg-transparent text-gray-600 hover:bg-gray-50'} disabled:cursor-not-allowed disabled:opacity-50`}
                        >
                            Last duration
                        </button>
                        <button
                            type="button"
                            onClick={() => setExportMode('all')}
                            disabled={isExporting}
                            className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${exportMode === 'all' ? 'bg-gray-900 text-white' : 'bg-transparent text-gray-600 hover:bg-gray-50'} disabled:cursor-not-allowed disabled:opacity-50`}
                        >
                            All data
                        </button>
                    </div>

                    <div className="h-20">
                        {exportMode === 'range' && (
                            <>
                                <p className="text-sm font-medium text-gray-900 mb-2">
                                    Export data from the last:
                                </p>
                                <div className="flex gap-3">
                                    <input
                                        type="number"
                                        min="1"
                                        value={durationValue}
                                        onChange={(e) => setDurationValue(e.target.value)}
                                        disabled={isExporting}
                                        className="flex h-10 w-24 rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
                                    />
                                    <div className="relative flex-1">
                                        <select
                                            value={durationUnit}
                                            onChange={(e) => setDurationUnit(e.target.value)}
                                            disabled={isExporting}
                                            className="appearance-none flex h-10 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 pr-8 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                                        >
                                            <option value="Seconds">Seconds</option>
                                            <option value="Minutes">Minutes</option>
                                            <option value="Hours">Hours</option>
                                            <option value="Days">Days</option>
                                        </select>
                                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-500">
                                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}

                        {exportMode === 'all' && (
                            <p className="text-sm text-gray-500">
                                Exports all recorded data for this session, from the earliest timestamp to now.
                            </p>
                        )}
                    </div>

                    <hr className="my-4 border-gray-100" />

                    {sessionId === null && (
                        <p className="text-sm text-red-600 font-medium mb-3">
                            No active session - please start or load a session before exporting.
                        </p>
                    )}

                    <p className="text-sm text-gray-400 font-medium mb-3">
                        Data will be exported as CSV format.
                    </p>

                    <Button
                        onClick={handleExport}
                        disabled={isExporting || sessionId === null}
                        className="w-full h-11 bg-[#2E7B75] hover:bg-[#256560] text-white rounded-lg text-sm font-semibold shadow-sm"
                    >
                        {isExporting ? 'Exporting…' : 'Export CSV'}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
