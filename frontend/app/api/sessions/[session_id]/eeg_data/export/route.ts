import { forwardToBackend } from '@/lib/backend-proxy';
import { NextRequest } from 'next/server';

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ session_id: string }> }
) {
    const { session_id } = await params;
    const body = await req.text();

    const response = await forwardToBackend({
        method: 'POST',
        path: `/api/sessions/${session_id}/eeg_data/export`,
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
