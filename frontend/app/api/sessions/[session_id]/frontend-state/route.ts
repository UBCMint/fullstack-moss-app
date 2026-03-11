import { forwardToBackend, passthroughJsonResponse } from '@/lib/backend-proxy';

export async function GET(
    _req: Request,
    context: {
        params: { session_id: string } | Promise<{ session_id: string }>;
    }
) {
    const params = await Promise.resolve(context.params);

    const response = await forwardToBackend({
        method: 'GET',
        path: `/api/sessions/${params.session_id}/frontend-state`,
    });

    return passthroughJsonResponse(response);
}

export async function POST(
    req: Request,
    context: {
        params: { session_id: string } | Promise<{ session_id: string }>;
    }
) {
    const params = await Promise.resolve(context.params);
    const body = await req.text();

    const response = await forwardToBackend({
        method: 'POST',
        path: `/api/sessions/${params.session_id}/frontend-state`,
        body,
    });

    return passthroughJsonResponse(response);
}

