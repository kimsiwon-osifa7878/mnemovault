export interface GraphNode {
  id: string;
  label: string;
  type: string;
  linkCount: number;
  isOperational?: boolean;
}

export interface GraphEdge {
  source: string;
  target: string;
  relation?: string;
  evidenceType?: "EXTRACTED" | "INFERRED" | "AMBIGUOUS";
  confidence?: number;
  sourceRef?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
