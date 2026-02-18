import { forwardToBackend, passthroughJsonResponse } from '@/lib/backend-proxy';

export async function GET() {
    const response = await forwardToBackend({
        method: 'GET',
        path: '/api/sessions',
    });

    return passthroughJsonResponse(response);
}

export async function POST(req: Request) {
    const body = await req.text();

    const response = await forwardToBackend({
        method: 'POST',
        path: '/api/sessions',
        body,
    });

    return passthroughJsonResponse(response);
}

