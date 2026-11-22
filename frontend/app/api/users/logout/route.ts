import { forwardToBackend, passthroughJsonResponse } from '@/lib/backend-proxy';

export async function POST(req: Request) {
    const response = await forwardToBackend({
        method: 'POST',
        path: '/users/logout',
        cookie: req.headers.get('cookie'),
    });

    return passthroughJsonResponse(response);
}
