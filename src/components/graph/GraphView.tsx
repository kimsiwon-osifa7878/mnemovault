"use client";

import { useEffect, useRef, useCallback, useState, useMemo } from "react";
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
  index: "#94a3b8",
  log: "#94a3b8",
};

const LEGEND_TYPES = ["concept", "entity", "source", "analysis"] as const;

// Stable function references to avoid re-renders from inline arrow functions
const NODE_CANVAS_MODE = () => "replace" as const;
const LINK_COLOR = () => "rgba(255,255,255,0.10)";

interface GraphViewProps {
  onNodeClick: (slug: string) => void;
}

interface NodeObject {
  id?: string | number;
  label?: string;
  type?: string;
  linkCount?: number;
  x?: number;
  y?: number;
}

export default function GraphView({ onNodeClick }: GraphViewProps) {
  const { graphData, fetchGraph, selectedNode, setSelectedNode } = useGraphStore();
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState({ width: 320, height: 400 });

  // Refs to hold latest hover/select state — lets nodeCanvasObject read
  // current values without being recreated on every state change
  const hoveredNodeRef = useRef<string | null>(null);
  const selectedNodeRef = useRef<string | null>(null);
  hoveredNodeRef.current = hoveredNode;
  selectedNodeRef.current = selectedNode;

  // Memoize graph data so react-force-graph-2d receives a stable reference.
  // Only recomputes when the actual node/edge arrays change, NOT on hover/select.
  const stableGraphData = useMemo(() => ({
    nodes: graphData.nodes.map((n) => ({ ...n })),
    links: graphData.edges.map((e) => ({ ...e })),
  }), [graphData.nodes, graphData.edges]);

  useEffect(() => {
    fetchGraph();
  }, [fetchGraph]);

  // Measure container and respond to resize
  useEffect(() => {
    const measure = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Configure D3 forces whenever graph data actually changes
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg || stableGraphData.nodes.length === 0) return;

    const n = stableGraphData.nodes.length;

    // Stronger repulsion: scale with node count to prevent clustering
    const charge = fg.d3Force("charge");
    if (charge) {
      const strength = -Math.min(500, 120 + n * 12);
      charge.strength(strength);
    }

    // Longer link distance: more room between connected nodes
    const link = fg.d3Force("link");
    if (link) {
      const distance = Math.min(180, 80 + n * 2);
      link.distance(distance);
    }

    // Restart simulation so new forces take effect
    fg.d3ReheatSimulation();
  }, [stableGraphData]);

  // Zoom to fit the whole graph once simulation settles
  const handleEngineStop = useCallback(() => {
    fgRef.current?.zoomToFit(600, 50);
  }, []);

  const handleNodeClick = useCallback(
    (node: NodeObject) => {
      if (node.id) {
        const slug = String(node.id);
        setSelectedNode(slug);
        onNodeClick(slug);
      }
    },
    [onNodeClick, setSelectedNode]
  );

  const handleNodeHover = useCallback((node: NodeObject | null) => {
    setHoveredNode(node?.id ? String(node.id) : null);
  }, []);

  const nodeCanvasObject = useCallback(
    (node: NodeObject, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const label = node.label || String(node.id ?? "");
      const type = node.type || "concept";
      const linkCount = node.linkCount ?? 0;
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const id = String(node.id ?? "");

      // Read from refs — no dependency on React state, so callback is stable
      const isSelected = selectedNodeRef.current === id;
      const isHovered = hoveredNodeRef.current === id;

      const color = NODE_COLORS[type] || "#60a5fa";

      // Node radius: base + hub bonus, scaled with zoom
      const radius = Math.max(
        2.5,
        (4 + Math.min(linkCount * 1.5, 10)) / Math.max(globalScale * 0.8, 1)
      );

      // Glow halo for selected / hovered nodes
      if (isSelected || isHovered) {
        const haloRadius = radius * 2.6;
        const grad = ctx.createRadialGradient(x, y, radius * 0.5, x, y, haloRadius);
        grad.addColorStop(0, color + "50");
        grad.addColorStop(1, "transparent");
        ctx.beginPath();
        ctx.arc(x, y, haloRadius, 0, 2 * Math.PI);
        ctx.fillStyle = grad;
        ctx.fill();
      }

      // Node circle
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, 2 * Math.PI);
      if (isSelected) {
        ctx.fillStyle = "#ffffff";
      } else if (isHovered) {
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
      } else {
        ctx.fillStyle = color + "cc";
        ctx.shadowBlur = 0;
      }
      ctx.fill();
      ctx.shadowBlur = 0;

      // Subtle ring
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, 2 * Math.PI);
      ctx.strokeStyle = isSelected ? "#ffffff" : color;
      ctx.lineWidth = Math.max(0.4, 1 / globalScale);
      ctx.stroke();

      // Label rendering
      const fontSize = Math.min(11, Math.max(7, 10 / globalScale));
      ctx.font = `${fontSize}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";

      // Truncate label based on zoom level
      const maxLen = Math.max(5, Math.floor(22 / Math.max(globalScale * 0.6, 0.5)));
      const displayLabel =
        label.length > maxLen ? label.slice(0, maxLen - 1) + "…" : label;

      const labelY = y + radius + 3 / globalScale;
      const metrics = ctx.measureText(displayLabel);
      const pad = 1.5 / globalScale;

      // Label background
      ctx.fillStyle = "rgba(10,10,15,0.72)";
      ctx.fillRect(
        x - metrics.width / 2 - pad,
        labelY - pad * 0.5,
        metrics.width + pad * 2,
        fontSize + pad
      );

      // Label text
      ctx.fillStyle = isSelected
        ? "#ffffff"
        : isHovered
        ? "#e2e8f0"
        : "rgba(255,255,255,0.5)";
      ctx.fillText(displayLabel, x, labelY);
    },
    [] // eslint-disable-line react-hooks/exhaustive-deps -- reads from refs intentionally
  );

  if (graphData.nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-white/20">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="w-8 h-8 opacity-30"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1}
            d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
          />
        </svg>
        <p className="text-xs">그래프 데이터 없음</p>
        <p className="text-[10px] text-white/10">
          위키 페이지를 추가하면 여기에 표시됩니다
        </p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full h-full relative">
      <ForceGraph2D
        ref={fgRef}
        graphData={stableGraphData}
        width={dimensions.width}
        height={dimensions.height}
        onNodeClick={handleNodeClick}
        onNodeHover={handleNodeHover}
        nodeCanvasObject={nodeCanvasObject}
        nodeCanvasObjectMode={NODE_CANVAS_MODE}
        linkColor={LINK_COLOR}
        linkWidth={1}
        backgroundColor="#0d0d14"
        warmupTicks={80}
        cooldownTicks={300}
        d3AlphaDecay={0.018}
        d3VelocityDecay={0.38}
        onEngineStop={handleEngineStop}
        enableNodeDrag
        enableZoomInteraction
        enablePanInteraction
        minZoom={0.3}
        maxZoom={8}
      />

      {/* Type legend */}
      <div className="absolute bottom-2 left-2 flex flex-col gap-1 bg-black/50 rounded-md px-2 py-1.5 backdrop-blur-sm pointer-events-none">
        {LEGEND_TYPES.map((type) => (
          <div key={type} className="flex items-center gap-1.5">
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: NODE_COLORS[type] }}
            />
            <span className="text-[9px] text-white/35 capitalize">{type}</span>
          </div>
        ))}
      </div>

      {/* Node count badge */}
      <div className="absolute top-2 right-2 text-[9px] text-white/20 pointer-events-none">
        {graphData.nodes.length} nodes · {graphData.edges.length} links
      </div>
    </div>
  );
}
