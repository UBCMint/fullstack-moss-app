export type PipelineNode = {
    id: string;
    type: string;
    config: Record<string, unknown>;
};

export type PipelineEdge = {
    source: string;
    target: string;
};

export type PipelinePayload = {
    session_id: string;
    nodes: PipelineNode[];
    edges: PipelineEdge[];
};

// sent by the server when a session can't start
export type PipelineServerError = {
    type: 'error';
    code:
        | 'invalid_message'
        | 'invalid_pipeline'
        | 'no_source'
        | 'pipeline_init_failed'
        | 'internal_error';
    message: string;
    node_id?: string;
};

export const isPipelineServerError = (
    value: unknown
): value is PipelineServerError =>
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'error' &&
    typeof (value as { message?: unknown }).message === 'string';
