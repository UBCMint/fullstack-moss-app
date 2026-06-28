export type PipelineNode = {
  type: string;
  config: Record<string, unknown>;
};

export type PipelinePayload = {
  session_id: string;
  nodes: PipelineNode[];
};
