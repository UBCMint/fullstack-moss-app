export type PipelineNode = {
  type: string;
  config: Record<string, any>;
};

export type PipelinePayload = {
  session_id: string;
  nodes: PipelineNode[];
};
