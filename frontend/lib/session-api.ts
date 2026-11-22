import { FrontendWorkspaceState } from '@/lib/frontend-state';

export type SessionSummary = {
    id: number;
    name: string;
};

async function parseErrorMessage(response: Response): Promise<string> {
    const fallback = `Request failed (${response.status})`;

    try {
        const text = await response.text();
        if (!text) {
            return fallback;
        }

        try {
            const parsed = JSON.parse(text) as unknown;
            if (typeof parsed === 'string') {
                return parsed;
            }
            if (
                parsed &&
                typeof parsed === 'object' &&
                'message' in parsed &&
                typeof (parsed as { message?: unknown }).message === 'string'
            ) {
                return (parsed as { message: string }).message;
            }
        } catch {
            return text;
        }

        return text;
    } catch {
        return fallback;
    }
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
        throw new Error(await parseErrorMessage(response));
    }
    return (await response.json()) as T;
}

export async function getSessions(): Promise<SessionSummary[]> {
    const response = await fetch('/api/sessions', { method: 'GET' });
    return parseJsonResponse<SessionSummary[]>(response);
}

export async function createSession(name: string): Promise<SessionSummary> {
    const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        // Backend currently expects a JSON string body.
        body: JSON.stringify(name),
    });
    return parseJsonResponse<SessionSummary>(response);
}

export async function saveFrontendState(
    sessionId: number,
    state: FrontendWorkspaceState
): Promise<void> {
    const response = await fetch(`/api/sessions/${sessionId}/frontend-state`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(state),
    });

    if (!response.ok) {
        throw new Error(await parseErrorMessage(response));
    }
}

export async function loadFrontendState(sessionId: number): Promise<unknown> {
    const response = await fetch(`/api/sessions/${sessionId}/frontend-state`, {
        method: 'GET',
    });
    return parseJsonResponse<unknown>(response);
}

export type NewTimeLabel = {
    start_timestamp: string;
    end_timestamp: string | null;
    label: string;
    color: string;
};

export type TimeLabel = {
    id: number;
    session_id: number;
    start_timestamp: string;
    end_timestamp: string | null;
    label: string;
    color: string;
};

// One row of GET /api/sessions/:id/eeg-data. A null channel is one the
// recording device doesn't have (e.g. eeg5..eeg8 and emg* for a 4-channel Muse).
export type EegDataRow = {
    time: string;
    eeg1: number | null;
    eeg2: number | null;
    eeg3: number | null;
    eeg4: number | null;
    eeg5: number | null;
    eeg6: number | null;
    eeg7: number | null;
    eeg8: number | null;
    emg1: number | null;
    emg2: number | null;
    emg3: number | null;
    emg4: number | null;
};

export async function saveTimeLabels(
    sessionId: number,
    payload: NewTimeLabel[]
): Promise<void> {
    const response = await fetch(`/api/sessions/${sessionId}/time-label`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });
    if (!response.ok) {
        throw new Error(await parseErrorMessage(response));
    }
}

export async function getTimeLabels(
    sessionId: number,
    start: string,
    end: string
): Promise<TimeLabel[]> {
    const params = new URLSearchParams({ start, end });
    const response = await fetch(
        `/api/sessions/${sessionId}/time-label?${params}`,
        { method: 'GET' }
    );
    return parseJsonResponse<TimeLabel[]>(response);
}

export async function getEegData(
    sessionId: number,
    start: string,
    end: string
): Promise<EegDataRow[]> {
    const params = new URLSearchParams({ start, end });
    const response = await fetch(
        `/api/sessions/${sessionId}/eeg-data?${params}`,
        { method: 'GET' }
    );
    return parseJsonResponse<EegDataRow[]>(response);
}
