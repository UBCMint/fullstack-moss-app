const DEFAULT_API_BASES = [
    process.env.SESSION_API_BASE_URL,
    process.env.API_BASE_URL,
    process.env.VITE_API_URL,
    'http://api-server:9000',
    'http://127.0.0.1:9000',
    'http://localhost:9000',
].filter((v): v is string => Boolean(v));

type ForwardOptions = {
    path: string;
    method: 'GET' | 'POST';
    body?: string;
    contentType?: string;
};

export async function forwardToBackend(
    options: ForwardOptions
): Promise<Response> {
    const headers: Record<string, string> = {};
    if (options.contentType) {
        headers['Content-Type'] = options.contentType;
    } else if (options.method === 'POST') {
        headers['Content-Type'] = 'application/json';
    }

    let lastError: unknown = null;

    for (const baseUrl of DEFAULT_API_BASES) {
        const url = `${baseUrl.replace(/\/$/, '')}${options.path}`;
        try {
            return await fetch(url, {
                method: options.method,
                headers,
                body: options.body,
                cache: 'no-store',
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
            headers: {
                'Content-Type': 'application/json',
            },
        }
    );
}

export async function passthroughJsonResponse(
    backendResponse: Response
): Promise<Response> {
    const text = await backendResponse.text();
    return new Response(text, {
        status: backendResponse.status,
        headers: {
            'Content-Type':
                backendResponse.headers.get('Content-Type') ||
                'application/json',
        },
    });
}

