'use client';

import { useRef, useState, DragEvent } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { useNotifications } from '@/components/notifications';
import { importEEGData } from '@/lib/eeg-api';
import { Folder } from 'lucide-react';
import { EnterIcon, InfoCircledIcon } from '@radix-ui/react-icons';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

type ImportDialogProps = {
    open: boolean;
    sessionId: number | null;
    onOpenChange: (open: boolean) => void;
    /** Called on successful import so downstream components can react */
    onImportSuccess?: () => void;
};

export default function ImportDialog({
    open,
    sessionId,
    onOpenChange,
    onImportSuccess,
}: ImportDialogProps) {
    const notifications = useNotifications();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isImporting, setIsImporting] = useState(false);
    const [isDragging, setIsDragging] = useState(false);

    const handleClose = () => {
        if (!isImporting) {
            if (fileInputRef.current) fileInputRef.current.value = '';
            onOpenChange(false);
        }
    };

    const processFile = async (file: File) => {
        if (sessionId === null) {
            notifications.error({
                title: 'No active session',
                description: 'Please start or load a session before importing.',
            });
            return;
        }

        if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
            notifications.error({
                title: 'Invalid file type',
                description: 'Please select a CSV file.',
            });
            return;
        }

        setIsImporting(true);
        try {
            const csvText = await file.text();
            await importEEGData(sessionId, csvText);
            notifications.success({
                title: 'EEG data imported successfully',
                description: `${file.name} has been loaded into session ${sessionId}.`,
            });
            onImportSuccess?.();
            onOpenChange(false);
        } catch (error) {
            notifications.error({
                title: 'Import failed',
                description:
                    error instanceof Error ? error.message : 'Unexpected error',
            });
        } finally {
            setIsImporting(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0] ?? null;
        if (file) {
            processFile(file);
        }
    };

    const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };

    const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };

    const handleDrop = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        const file = e.dataTransfer.files?.[0];
        if (file) {
            processFile(file);
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-[425px] p-8">
                <DialogHeader className="mb-4 text-left">
                    <DialogTitle className="flex items-center text-2xl font-bold mb-2">
                        <EnterIcon className="mr-2" width={24} height={24} />
                        Import Data
                    </DialogTitle>
                    <DialogDescription className="text-gray-500 text-sm flex items-center gap-1.5">
                        Only CSV files are accepted.
                        <Popover>
                            <PopoverTrigger asChild>
                                <button type="button" className="inline-flex items-center text-gray-400 hover:text-gray-600 transition-colors">
                                    <InfoCircledIcon width={14} height={14} />
                                </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-90 text-sm" side="bottom" align="start">
                                <p className="font-semibold mb-2">Expected CSV format</p>
                                <p className="text-gray-500 mb-2">The file must have a header row followed by data rows in this shape:</p>
                                <code className="block bg-gray-100 rounded px-2 py-1.5 text-xs font-mono mb-2">
                                    Time,Channel1,Channel2,Channel3,Channel4
                                </code>
                                <p className="text-gray-500">The <span className="font-medium text-gray-700">Time</span> column must be in <span className="font-medium text-gray-700">RFC 3339</span> format (e.g. <code className="text-xs font-mono">2024-01-15T13:45:00Z</code>).</p>
                            </PopoverContent>
                        </Popover>
                    </DialogDescription>
                </DialogHeader>

                <div className="py-2">
                    {/* Drag and drop zone */}
                    <div
                        className={`border-2 border-dashed rounded-xl flex flex-col items-center justify-center py-10 px-4 transition-colors ${isDragging ? 'border-primary bg-primary/5' : 'border-gray-300'
                            } ${isImporting ? 'opacity-50 pointer-events-none' : ''}`}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                    >
                        <Folder className="w-12 h-12 mb-4 text-black" fill="black" />
                        <p className="text-sm font-medium text-gray-900 mb-1">
                            {isImporting ? 'Importing...' : 'Drag CSV file here'}
                        </p>
                        {!isImporting && (
                            <p className="text-sm text-gray-500">
                                Or{' '}
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    className="text-blue-600 hover:underline hover:text-blue-800 font-medium"
                                >
                                    Browse Files
                                </button>
                            </p>
                        )}
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".csv,text/csv"
                            onChange={handleFileChange}
                            disabled={isImporting}
                            className="hidden"
                        />
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
