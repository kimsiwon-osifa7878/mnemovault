export interface GraphNode {
  id: string;
  label: string;
  type: string;
  linkCount: number;
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
