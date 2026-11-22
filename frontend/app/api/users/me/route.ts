import { forwardToBackend, passthroughJsonResponse } from '@/lib/backend-proxy';

export async function GET(req: Request) {
    const response = await forwardToBackend({
        method: 'GET',
        path: '/users/me',
        cookie: req.headers.get('cookie'),
    });

    return passthroughJsonResponse(response);
}
