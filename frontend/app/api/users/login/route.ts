import { forwardToBackend, passthroughJsonResponse } from '@/lib/backend-proxy';

export async function POST(req: Request) {
    const body = await req.text();

    const response = await forwardToBackend({
        method: 'POST',
        path: '/users/login',
        body,
        cookie: req.headers.get('cookie'),
    });

    return passthroughJsonResponse(response);
}
