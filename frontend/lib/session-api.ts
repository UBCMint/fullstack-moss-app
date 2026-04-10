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

export async function saveTimeLabels(
    sessionId: number,
    payload: { timestamp: string, label: string }[]
): Promise<void> {
    // second parameter: payload: { timestamp: string, label: string }[]
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

