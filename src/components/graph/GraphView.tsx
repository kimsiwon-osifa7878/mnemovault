"use client";

import { useEffect, useRef, useCallback } from "react";
import { useGraphStore } from "@/stores/graph-store";
import dynamic from "next/dynamic";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
});

const NODE_COLORS: Record<string, string> = {
  entity: "#a78bfa",
  concept: "#60a5fa",
  source: "#34d399",
  analysis: "#fb923c",
};

interface GraphViewProps {
  onNodeClick: (slug: string) => void;
}

export default function GraphView({ onNodeClick }: GraphViewProps) {
  const { graphData, fetchGraph, selectedNode, setSelectedNode } =
    useGraphStore();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchGraph();
  }, [fetchGraph]);

  const handleNodeClick = useCallback(
    (node: { id?: string | number }) => {
      if (node.id) {
        const slug = String(node.id);
        setSelectedNode(slug);
        onNodeClick(slug);
      }
    },
    [onNodeClick, setSelectedNode]
  );

  const nodeCanvasObject = useCallback(
    (
      node: { id?: string | number; label?: string; type?: string; x?: number; y?: number },
      ctx: CanvasRenderingContext2D,
      globalScale: number
    ) => {
      const label = (node as { label?: string }).label || String(node.id);
      const type = (node as { type?: string }).type || "concept";
      const fontSize = 11 / globalScale;
      const nodeSize = 4 / globalScale;

      const x = node.x || 0;
      const y = node.y || 0;

      // Node circle
      ctx.beginPath();
      ctx.arc(x, y, nodeSize, 0, 2 * Math.PI);
      ctx.fillStyle = NODE_COLORS[type] || "#60a5fa";
      if (selectedNode === String(node.id)) {
        ctx.fillStyle = "#ffffff";
      }
      ctx.fill();

      // Label
      ctx.font = `${fontSize}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.fillText(label, x, y + nodeSize + 2 / globalScale);
    },
    [selectedNode]
  );

  if (graphData.nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-white/20 text-xs">
        No graph data yet
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full h-full">
      <ForceGraph2D
        graphData={{
          nodes: graphData.nodes.map((n) => ({ ...n })),
          links: graphData.edges.map((e) => ({ ...e })),
        }}
        width={containerRef.current?.clientWidth || 300}
        height={containerRef.current?.clientHeight || 200}
        onNodeClick={handleNodeClick}
        nodeCanvasObject={nodeCanvasObject}
        linkColor={() => "rgba(255,255,255,0.08)"}
        backgroundColor="#0d0d14"
        cooldownTicks={100}
      />
    </div>
  );
}
