import { GraphData } from "@/types/graph";

export function getNeighborNodes(
  slug: string,
  graphData: GraphData
): string[] {
  const neighbors = new Set<string>();
  for (const edge of graphData.edges) {
    if (edge.source === slug) neighbors.add(edge.target);
    if (edge.target === slug) neighbors.add(edge.source);
  }
  return Array.from(neighbors);
}

export function getBacklinksFromGraph(
  slug: string,
  graphData: GraphData
): string[] {
  return graphData.edges
    .filter((e) => e.target === slug)
    .map((e) => e.source);
}
