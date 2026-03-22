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

type ImportDialogProps = {
    open: boolean;
    sessionId: number | null;
    onOpenChange: (open: boolean) => void;
    /** Called on successful import so downstream components can react */
    onImportSuccess?: () => void;
};

const ImportIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="none" className="mr-3 h-6 w-6">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" />
        <path fill="#fff" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M12 12H4M8 8l-4 4 4 4" />
    </svg>
);

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
                        <ImportIcon />
                        Import Data
                    </DialogTitle>
                    <DialogDescription className="text-gray-500 text-sm">
                        Only CSV files are accepted.
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
