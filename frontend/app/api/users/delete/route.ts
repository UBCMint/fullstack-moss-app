import { forwardToBackend, passthroughJsonResponse } from '@/lib/backend-proxy';

// Deletes the logged-in user's own account — the backend derives who that
// is from the session cookie, so no body is needed here.
export async function POST(req: Request) {
    const response = await forwardToBackend({
        method: 'POST',
        path: '/users/delete',
        cookie: req.headers.get('cookie'),
    });

    return passthroughJsonResponse(response);
}
