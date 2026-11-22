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
import {
    importEEGData,
    ImportValidationError,
    CsvProblem,
    EEG_CSV_EXAMPLE,
    MAX_IMPORT_BYTES,
} from '@/lib/eeg-api';
import { getUserFacingErrorMessage } from '@/lib/errors';
import { Folder } from 'lucide-react';
import { EnterIcon } from '@radix-ui/react-icons';

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
    const [problems, setProblems] = useState<{
        fileName: string;
        summary: string;
        items: CsvProblem[];
        total: number;
    } | null>(null);

    const handleClose = () => {
        if (!isImporting) {
            setProblems(null);
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

        setProblems(null);

        if (!file.name.toLowerCase().endsWith('.csv')) {
            notifications.error({
                title: 'Invalid file type',
                description: `"${file.name}" is not a .csv file. Export your data as CSV (comma-separated) and try again.`,
            });
            return;
        }

        if (file.size === 0) {
            notifications.error({
                title: 'Empty file',
                description: `"${file.name}" is empty. It needs a header line followed by data rows.`,
            });
            return;
        }

        if (file.size > MAX_IMPORT_BYTES) {
            notifications.error({
                title: 'File too large',
                description: `"${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)} MB. The maximum is ${MAX_IMPORT_BYTES / 1024 / 1024} MB; split it into smaller files.`,
            });
            return;
        }

        setIsImporting(true);
        try {
            const csvText = await file.text();
            const { rowsRead, rowsInserted } = await importEEGData(
                sessionId,
                csvText
            );
            const skipped = rowsRead - rowsInserted;
            notifications.success({
                title: 'EEG data imported successfully',
                description: `${rowsInserted.toLocaleString()} rows from ${file.name} loaded into session ${sessionId}.${skipped > 0 ? ` ${skipped.toLocaleString()} rows were skipped because their time already exists in the session.` : ''}`,
            });
            onImportSuccess?.();
            onOpenChange(false);
        } catch (error) {
            if (error instanceof ImportValidationError) {
                console.error(error);
                setProblems({
                    fileName: file.name,
                    summary: error.message,
                    items: error.problems,
                    total: error.totalProblems,
                });
                return;
            }
            notifications.error({
                title: 'Import failed',
                description: getUserFacingErrorMessage(error),
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
            <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto p-8">
                <DialogHeader className="mb-4 text-left">
                    <DialogTitle className="flex items-center text-2xl font-bold mb-2">
                        <EnterIcon className="mr-2" width={24} height={24} />
                        Import Data
                    </DialogTitle>
                    <DialogDescription className="text-gray-500 text-sm">
                        Import a CSV file into the active session.
                    </DialogDescription>
                </DialogHeader>

                <div className="mb-4 rounded-lg bg-gray-50 border border-gray-200 p-3 text-xs text-gray-600">
                    <p className="font-semibold text-gray-800 mb-1">
                        File requirements
                    </p>
                    <ul className="list-disc pl-4 space-y-0.5 mb-2">
                        <li>
                            A <b>.csv</b> text file (UTF-8, comma-separated), up
                            to {MAX_IMPORT_BYTES / 1024 / 1024} MB.
                        </li>
                        <li>
                            First line is the header, exactly:{' '}
                            <code className="font-mono">
                                time,channel1,channel2,channel3,channel4
                            </code>{' '}
                            (any letter case, this order).
                        </li>
                        <li>
                            Every row has exactly 5 values and a unique{' '}
                            <b>time</b>.
                        </li>
                        <li>
                            <b>time</b>: RFC 3339 with a time zone, e.g.{' '}
                            <code className="font-mono">
                                2024-01-15T13:45:00Z
                            </code>
                            . Not accepted: 2024-01-15 13:45:00, 01/15/2024.
                        </li>
                        <li>
                            <b>channel1&ndash;channel4</b>: whole numbers only
                            (e.g. 120 or -45), between -2,147,483,648 and
                            2,147,483,647. No decimals, units, blanks, or
                            thousands separators.
                        </li>
                        <li>
                            The whole file is checked first; if anything is
                            wrong, nothing is imported. Rows whose time already
                            exists in the session are skipped.
                        </li>
                    </ul>
                    <p className="font-semibold text-gray-800 mb-1">Example</p>
                    <pre className="bg-white border border-gray-200 rounded px-2 py-1.5 font-mono overflow-x-auto">
                        {EEG_CSV_EXAMPLE}
                    </pre>
                </div>

                {problems && (
                    <div
                        role="alert"
                        className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800"
                    >
                        <p className="font-semibold mb-1">
                            Import failed: {problems.fileName}
                        </p>
                        <p className="mb-2">{problems.summary}</p>
                        <ul className="space-y-1 max-h-40 overflow-y-auto">
                            {problems.items.map((p, i) => (
                                <li key={i}>
                                    <span className="font-semibold">
                                        {[
                                            p.line !== null
                                                ? `Line ${p.line}`
                                                : null,
                                            p.column
                                                ? `column "${p.column}"`
                                                : null,
                                        ]
                                            .filter(Boolean)
                                            .join(', ')}
                                        {p.line !== null || p.column
                                            ? ': '
                                            : ''}
                                    </span>
                                    {p.value !== null && p.value !== '' && (
                                        <>
                                            value{' '}
                                            <code className="font-mono">
                                                &quot;{p.value}&quot;
                                            </code>{' '}
                                            &mdash;{' '}
                                        </>
                                    )}
                                    {p.problem}
                                </li>
                            ))}
                        </ul>
                        {problems.total > problems.items.length && (
                            <p className="mt-2">
                                &hellip;and{' '}
                                {problems.total - problems.items.length} more.
                                Fix these and re-upload to see the rest.
                            </p>
                        )}
                    </div>
                )}

                <div className="py-2">
                    {/* Drag and drop zone */}
                    <div
                        className={`border-2 border-dashed rounded-xl flex flex-col items-center justify-center py-10 px-4 transition-colors ${
                            isDragging
                                ? 'border-primary bg-primary/5'
                                : 'border-gray-300'
                        } ${isImporting ? 'opacity-50 pointer-events-none' : ''}`}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                    >
                        <Folder
                            className="w-12 h-12 mb-4 text-black"
                            fill="black"
                        />
                        <p className="text-sm font-medium text-gray-900 mb-1">
                            {isImporting
                                ? 'Importing...'
                                : 'Drag CSV file here'}
                        </p>
                        {!isImporting && (
                            <p className="text-sm text-gray-500">
                                Or{' '}
                                <button
                                    type="button"
                                    onClick={() =>
                                        fileInputRef.current?.click()
                                    }
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
