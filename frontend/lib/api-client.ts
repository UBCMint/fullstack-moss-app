/**
 * Shared fetch wrapper for calls to our /api/* proxy routes. A 401 from any
 * of them means the session cookie is missing or the back-end has rejected
 * it (expired or revoked) — not just an auth-page-specific "wrong password"
 * case — so this notifies a single global handler (registered by
 * AuthProvider) before the caller sees the response, rather than letting a
 * 401 fail silently mid-action (e.g. a session save).
 */

type SessionExpiredHandler = () => void;

let sessionExpiredHandler: SessionExpiredHandler | null = null;

export function setSessionExpiredHandler(
    handler: SessionExpiredHandler | null
): void {
    sessionExpiredHandler = handler;
}

export function notifySessionExpired(): void {
    sessionExpiredHandler?.();
}

export async function apiFetch(
    input: string,
    init?: RequestInit
): Promise<Response> {
    const response = await fetch(input, init);
    if (response.status === 401) {
        notifySessionExpired();
    }
    return response;
}
