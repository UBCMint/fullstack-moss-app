import { forwardToBackend } from '@/lib/backend-proxy';
import { NextRequest } from 'next/server';

export async function POST(
    req: NextRequest,
    { params }: { params: { session_id: string } }
) {
    const body = await req.text();

    const response = await forwardToBackend({
        method: 'POST',
        path: `/api/sessions/${params.session_id}/eeg_data/export`,
        body,
        contentType: 'application/json',
    });

    // Return the CSV as plain text
    const text = await response.text();
    return new Response(text, {
        status: response.status,
        headers: {
            'Content-Type': response.headers.get('Content-Type') ?? 'text/csv',
        },
    });
}
