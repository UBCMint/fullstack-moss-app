import { notifySessionExpired } from '@/lib/api-client';

export type PublicUser = {
    id: number;
    username: string;
    email: string;
};

export type AuthErrorKind =
    | 'unauthorized' // 401 — wrong credentials on login, or no/expired session on getMe
    | 'duplicate_account' // 409 on signup
    | 'validation' // 400 on signup (bad email / short password)
    | 'network' // fetch itself failed, or a 5xx came back
    | 'unknown';

export class AuthError extends Error {
    kind: AuthErrorKind;

    constructor(kind: AuthErrorKind, message: string) {
        super(message);
        this.kind = kind;
    }
}

async function parseErrorMessage(response: Response): Promise<string> {
    try {
        const text = await response.text();
        return text || `Request failed (${response.status})`;
    } catch {
        return `Request failed (${response.status})`;
    }
}

function kindForStatus(status: number): AuthErrorKind {
    if (status === 401) return 'unauthorized';
    if (status === 409) return 'duplicate_account';
    if (status === 400) return 'validation';
    if (status >= 500) return 'network';
    return 'unknown';
}

async function authFetch(
    path: string,
    init?: RequestInit,
    // getMe/logout need a 401 here to also trip the global session-expired
    // redirect (see lib/api-client.ts); login/signUp must not — a wrong
    // password there is a normal form error, not an expired session.
    options: { reportSessionExpiry?: boolean } = {}
): Promise<Response> {
    let response: Response;
    try {
        response = await fetch(path, init);
    } catch {
        // fetch() throws (not a Response) on a real network/connection failure.
        throw new AuthError(
            'network',
            'Unable to connect to the server. Please try again later.'
        );
    }

    if (response.status === 401 && options.reportSessionExpiry) {
        notifySessionExpired();
    }

    if (!response.ok) {
        const message = await parseErrorMessage(response);
        throw new AuthError(kindForStatus(response.status), message);
    }

    return response;
}

export async function signUp(data: {
    username: string;
    email: string;
    password: string;
}): Promise<PublicUser> {
    const response = await authFetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    return (await response.json()) as PublicUser;
}

export async function login(data: {
    email: string;
    password: string;
}): Promise<PublicUser> {
    const response = await authFetch('/api/users/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    return (await response.json()) as PublicUser;
}

export async function logout(): Promise<void> {
    // No reportSessionExpiry here: a 401 just means the session was already
    // gone, which doesn't need the "your session expired" redirect — the
    // caller is already sending the user to /login regardless.
    await authFetch('/api/users/logout', { method: 'POST' });
}

export async function getMe(): Promise<PublicUser> {
    const response = await authFetch(
        '/api/users/me',
        { method: 'GET' },
        { reportSessionExpiry: true }
    );
    return (await response.json()) as PublicUser;
}
