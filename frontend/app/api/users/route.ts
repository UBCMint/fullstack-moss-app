import { forwardToBackend, passthroughJsonResponse } from '@/lib/backend-proxy';

// Sign up. Does not log the new user in — call /api/users/login afterward
// to get a session cookie.
export async function POST(req: Request) {
    const body = await req.text();

    const response = await forwardToBackend({
        method: 'POST',
        path: '/users',
        body,
    });

    return passthroughJsonResponse(response);
}
