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
        } catch (_) {
            return text;
        }

        return text;
    } catch (_) {
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

export type EegDataRow = {
    time: string;
    channel1: number;
    channel2: number;
    channel3: number;
    channel4: number;
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
    const response = await fetch(`/api/sessions/${sessionId}/time-label?${params}`, { method: 'GET' });
    return parseJsonResponse<TimeLabel[]>(response);
}

export async function getEegData(
    sessionId: number,
    start: string,
    end: string
): Promise<EegDataRow[]> {
    const params = new URLSearchParams({ start, end });
    const response = await fetch(`/api/sessions/${sessionId}/eeg-data?${params}`, { method: 'GET' });
    return parseJsonResponse<EegDataRow[]>(response);
}
