import { apiFetch as fetch } from '@/lib/api-client';
import { UserFacingError } from '@/lib/errors';

/**
 * The CSV format accepted by import and produced by export. Keep in sync with
 * backend `parse_eeg_csv` (shared-logic/src/db.rs) and docs/eeg-csv-format.md.
 */
export const EEG_CSV_COLUMNS = [
    'time',
    'channel1',
    'channel2',
    'channel3',
    'channel4',
] as const;
export const EEG_CSV_EXAMPLE = [
    EEG_CSV_COLUMNS.join(','),
    '2024-01-15T13:45:00Z,120,-45,310,8',
    '2024-01-15T13:45:00.004Z,118,-47,305,10',
].join('\n');
/** Must match MAX_IMPORT_BYTES in the backend. */
export const MAX_IMPORT_BYTES = 50 * 1024 * 1024;

/** One problem the backend found in an uploaded CSV. */
export type CsvProblem = {
    line: number | null;
    column: string | null;
    value: string | null;
    problem: string;
};

/** Thrown when the backend rejects an import file; carries per-row details. */
export class ImportValidationError extends UserFacingError {
    readonly problems: CsvProblem[];
    readonly totalProblems: number;

    constructor(message: string, problems: CsvProblem[], total: number) {
        super(message);
        this.name = 'ImportValidationError';
        this.problems = problems;
        this.totalProblems = total;
    }
}

export type ExportOptions = {
    format?: 'csv';
    includeHeader?: boolean;
    start_time?: string; // RFC3339
    end_time?: string; // RFC3339
};

export type ExportRequest = {
    filename: string;
    options: ExportOptions;
};

/**
 * Request an EEG CSV export from the backend for the given session.
 * Returns the raw CSV string.
 */
export async function exportEEGData(
    sessionId: number,
    options: ExportOptions = {}
): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `session_${sessionId}_${timestamp}.csv`;

    const body: ExportRequest = {
        filename,
        options: {
            format: 'csv',
            includeHeader: true,
            ...options,
        },
    };

    const response = await fetch(`/api/sessions/${sessionId}/eeg_data/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        // 400/404 messages are written for users by the backend; anything else
        // may be a raw server error and stays generic.
        if ((response.status === 400 || response.status === 404) && text) {
            throw new UserFacingError(text);
        }
        throw new Error(text || `Export failed (${response.status})`);
    }

    return response.text();
}

/**
 * Download a CSV string as a file in the browser.
 */
export function downloadCSV(csvContent: string, sessionId: number): void {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `session_${sessionId}_${timestamp}.csv`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * Import EEG data from a raw CSV string into the given session.
 */
export type ImportResult = {
    /** Data rows in the uploaded file. */
    rowsRead: number;
    /** Rows actually written; the rest already existed in the session. */
    rowsInserted: number;
};

export async function importEEGData(
    sessionId: number,
    csvText: string
): Promise<ImportResult> {
    const response = await fetch(`/api/sessions/${sessionId}/eeg_data/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/csv' },
        body: csvText,
    });

    if (!response.ok) {
        if (response.status === 413) {
            throw new UserFacingError(
                `The file is too large. The maximum size is ${MAX_IMPORT_BYTES / 1024 / 1024} MB; split it into smaller files.`
            );
        }

        const text = await response.text().catch(() => '');
        let body: {
            message?: string;
            errors?: CsvProblem[];
            total_errors?: number;
        } = {};
        try {
            body = JSON.parse(text);
        } catch {}

        if (response.status === 400 && body.message) {
            const problems = body.errors ?? [];
            throw new ImportValidationError(
                body.message,
                problems,
                body.total_errors ?? problems.length
            );
        }
        throw new Error(
            body.message || text || `Import failed (${response.status})`
        );
    }

    const result = await response.json().catch(() => ({}));
    const rowsRead =
        typeof result.rows_read === 'number' ? result.rows_read : 0;
    const rowsInserted =
        typeof result.rows_inserted === 'number'
            ? result.rows_inserted
            : rowsRead;
    return { rowsRead, rowsInserted };
}
