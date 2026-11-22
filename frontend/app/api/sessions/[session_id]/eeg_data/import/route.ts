import { forwardToBackend } from '@/lib/backend-proxy';
import { NextRequest } from 'next/server';

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ session_id: string }> }
) {
    const { session_id } = await params;
    const csvBody = await req.text();

    const backendResp = await forwardToBackend({
        method: 'POST',
        path: `/api/sessions/${session_id}/eeg_data/import`,
        body: csvBody,
        contentType: 'text/csv',
        cookie: req.headers.get('cookie'),
    });

    const text = await backendResp.text();
    return new Response(text, {
        status: backendResp.status,
        headers: {
            'Content-Type':
                backendResp.headers.get('Content-Type') ?? 'application/json',
        },
    });
}
