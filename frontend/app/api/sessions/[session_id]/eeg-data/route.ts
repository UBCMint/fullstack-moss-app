import { forwardToBackend, passthroughJsonResponse } from '@/lib/backend-proxy';

export async function GET(
    req: Request,
    context: {
        params: Promise<{ session_id: string }>;
    }
) {
    const params = await context.params;
    const requestUrl = new URL(req.url);
    const search = requestUrl.search;

    const response = await forwardToBackend({
        method: 'GET',
        path: `/api/sessions/${params.session_id}/eeg-data${search}`,
    });

    return passthroughJsonResponse(response);
}
