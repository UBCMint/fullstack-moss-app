export type ExportOptions = {
    format?: 'csv';
    includeHeader?: boolean;
    start_time?: string; // RFC3339
    end_time?: string;   // RFC3339
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

    const response = await fetch(
        `/api/sessions/${sessionId}/eeg_data/export`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        }
    );

    if (!response.ok) {
        let message = `Export failed (${response.status})`;
        try {
            const text = await response.text();
            if (text) message = text;
        } catch (_) { }
        throw new Error(message);
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
export async function importEEGData(
    sessionId: number,
    csvText: string
): Promise<void> {
    const response = await fetch(
        `/api/sessions/${sessionId}/eeg_data/import`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'text/csv' },
            body: csvText,
        }
    );

    if (!response.ok) {
        let message = `Import failed (${response.status})`;
        try {
            const text = await response.text();
            if (text) message = text;
        } catch (_) { }
        throw new Error(message);
    }
}
