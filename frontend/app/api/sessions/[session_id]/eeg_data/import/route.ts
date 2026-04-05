import { NextRequest } from 'next/server';

const DEFAULT_API_BASES = [
    process.env.SESSION_API_BASE_URL,
    process.env.API_BASE_URL,
    process.env.VITE_API_URL,
    'http://api-server:9000',
    'http://127.0.0.1:9000',
    'http://localhost:9000',
].filter((v): v is string => Boolean(v));

export async function POST(
    req: NextRequest,
    context: { params: Promise<{ session_id: string }> }
) {
    const params = await context.params;
    const csvBody = await req.text();
    const path = `/api/sessions/${params.session_id}/eeg_data/import`;

    let lastError: unknown = null;
    for (const baseUrl of DEFAULT_API_BASES) {
        const url = `${baseUrl.replace(/\/$/, '')}${path}`;
        try {
            const backendResp = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'text/csv' },
                body: csvBody,
                cache: 'no-store',
            });
            const text = await backendResp.text();
            return new Response(text, {
                status: backendResp.status,
                headers: {
                    'Content-Type':
                        backendResp.headers.get('Content-Type') ??
                        'application/json',
                },
            });
        } catch (error) {
            lastError = error;
        }
    }

    const fallbackMessage =
        lastError instanceof Error ? lastError.message : 'Unknown error';

    return new Response(
        JSON.stringify({
            message: `Could not reach API backend: ${fallbackMessage}`,
        }),
        {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
        }
    );
}
