"use client";

import { useEffect } from "react";
import GraphView from "@/components/graph/GraphView";
import { useGraphStore } from "@/stores/graph-store";

const MOCK_GRAPH_DATA = {
  nodes: [
    { id: "index", label: "Index", type: "index", linkCount: 3, isOperational: true },
    { id: "concept-llm", label: "LLM Compiler", type: "concept", linkCount: 4 },
    { id: "entity-karpathy", label: "Andrej Karpathy", type: "entity", linkCount: 2 },
    { id: "source-gist", label: "Karpathy Gist", type: "source", linkCount: 3 },
    { id: "analysis-rag", label: "RAG vs Compile", type: "analysis", linkCount: 2 },
  ],
  edges: [
    { source: "index", target: "concept-llm", evidenceType: "EXTRACTED" as const },
    { source: "index", target: "entity-karpathy", evidenceType: "EXTRACTED" as const },
    { source: "concept-llm", target: "source-gist", evidenceType: "INFERRED" as const },
    { source: "analysis-rag", target: "concept-llm", evidenceType: "EXTRACTED" as const },
    { source: "analysis-rag", target: "source-gist", evidenceType: "AMBIGUOUS" as const },
  ],
};

export default function GraphForceDebugPage() {
  const setGraphData = useGraphStore((state) => state.setGraphData);

  useEffect(() => {
    setGraphData(MOCK_GRAPH_DATA);
  }, [setGraphData]);

  return (
    <div className="h-screen bg-[#0a0a0f] p-3">
      <GraphView onNodeClick={() => {}} />
    </div>
  );
}
