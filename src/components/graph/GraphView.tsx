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

const LEGEND_TYPES = ["concept", "entity", "source", "analysis", "index", "log"] as const;
const NODE_CANVAS_MODE = () => "replace" as const;
const LABEL_LINE_LIMIT = 2;
const LABEL_CHARS_PER_LINE = 10;

interface GraphViewProps {
  onNodeClick: (slug: string) => void;
  resizeToken?: number;
}

interface NodeObject {
  id?: string | number;
  label?: string;
  type?: string;
  linkCount?: number;
  isOperational?: boolean;
  x?: number;
  y?: number;
}

interface LinkObject {
  source?: string | number | { id?: string | number };
  target?: string | number | { id?: string | number };
  relation?: string;
  evidenceType?: "EXTRACTED" | "INFERRED" | "AMBIGUOUS";
  confidence?: number;
  sourceRef?: string;
}

interface ForceGraphInstance {
  graphData: (data: { nodes: unknown[]; links: unknown[] }) => void;
  d3Force: (name: string) => Record<string, unknown> | null;
  d3ReheatSimulation: () => void;
  zoomToFit: (ms?: number, padding?: number) => void;
}

function splitLabelLines(label: string): string[] {
  const normalized = label.trim();
  if (!normalized) return [""];

  const firstLine = normalized.slice(0, LABEL_CHARS_PER_LINE);
  if (normalized.length <= LABEL_CHARS_PER_LINE) {
    return [firstLine];
  }

  const secondRaw = normalized.slice(LABEL_CHARS_PER_LINE, LABEL_CHARS_PER_LINE * LABEL_LINE_LIMIT);
  if (normalized.length <= LABEL_CHARS_PER_LINE * LABEL_LINE_LIMIT) {
    return [firstLine, secondRaw];
  }

  const secondLine = `${secondRaw.slice(0, Math.max(0, LABEL_CHARS_PER_LINE - 3))}...`;
  return [firstLine, secondLine];
}

function estimateCompositeRadius(node: NodeObject, fontSize: number, nodeSizeScale: number): number {
  const linkCount = node.linkCount ?? 0;
  const baseNodeRadius = Math.max(1.25, (4 + Math.min(linkCount * 1.5, 10)) * nodeSizeScale);
  const labelLines = splitLabelLines(node.label || String(node.id ?? ""));
  const maxChars = labelLines.reduce((max, line) => Math.max(max, line.length), 0);
  const labelHalfWidth = maxChars * fontSize * 0.34;
  const labelHeight = labelLines.length * fontSize * 1.2;
  const radialExtent = Math.hypot(labelHalfWidth, baseNodeRadius + 6 + labelHeight);
  return Math.max(baseNodeRadius, radialExtent);
}

export default function GraphView({ onNodeClick, resizeToken }: GraphViewProps) {
  const {
    graphData,
    selectedNode,
    setSelectedNode,
    graphUi,
    setGraphUiPartial,
  } = useGraphStore();

  const rootRef = useRef<HTMLDivElement>(null);
  const graphAreaRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null);

  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [graphDimensions, setGraphDimensions] = useState({ width: 1, height: 1 });
  const [pendingControls, setPendingControls] = useState(() => ({
    fontSize: graphUi.fontSize,
    nodeSizeScale: graphUi.nodeSizeScale,
    velocityDecay: graphUi.velocityDecay,
  }));

  const hoveredNodeRef = useRef<string | null>(null);
  const selectedNodeRef = useRef<string | null>(null);
  const graphUiRef = useRef(graphUi);
  const zoomKeyRef = useRef<string>("");

  useEffect(() => {
    hoveredNodeRef.current = hoveredNode;
    selectedNodeRef.current = selectedNode;
  }, [hoveredNode, selectedNode]);

  useEffect(() => {
    graphUiRef.current = graphUi;
  }, [graphUi]);

  const getForceGraph = useCallback((): ForceGraphInstance | null => {
    const current = fgRef.current as unknown;
    if (!current || typeof current !== "object") return null;

    if ("graphData" in current && typeof (current as { graphData?: unknown }).graphData === "function") {
      return current as ForceGraphInstance;
    }

    const nested = (current as { current?: unknown }).current;
    if (
      nested &&
      typeof nested === "object" &&
      "graphData" in nested &&
      typeof (nested as { graphData?: unknown }).graphData === "function"
    ) {
      return nested as ForceGraphInstance;
    }

    return null;
  }, []);

  const filteredGraphData = useMemo(() => {
    if (graphUi.showOperationalNodes) return graphData;

    const hiddenNodeIds = new Set(
      graphData.nodes.filter((node) => node.isOperational).map((node) => node.id)
    );

    return {
      nodes: graphData.nodes.filter((node) => !hiddenNodeIds.has(node.id)),
      edges: graphData.edges.filter(
        (edge) => !hiddenNodeIds.has(edge.source) && !hiddenNodeIds.has(edge.target)
      ),
    };
  }, [graphData, graphUi.showOperationalNodes]);

  const stableGraphData = useMemo(
    () => ({
      nodes: filteredGraphData.nodes.map((node) => ({ ...node })),
      links: filteredGraphData.edges.map((edge) => ({ ...edge })),
    }),
    [filteredGraphData.edges, filteredGraphData.nodes]
  );

  const graphRenderKey = useMemo(
    () =>
      [
        graphUi.fontSize,
        graphUi.nodeSizeScale,
        graphUi.velocityDecay,
        graphUi.showOperationalNodes,
      ].join(":"),
    [
      graphUi.fontSize,
      graphUi.nodeSizeScale,
      graphUi.velocityDecay,
      graphUi.showOperationalNodes,
    ]
  );

  const commitPendingControls = useCallback(() => {
    setGraphUiPartial({
      fontSize: pendingControls.fontSize,
      nodeSizeScale: pendingControls.nodeSizeScale,
      velocityDecay: pendingControls.velocityDecay,
    });
  }, [pendingControls.fontSize, pendingControls.nodeSizeScale, pendingControls.velocityDecay, setGraphUiPartial]);

  useEffect(() => {
    if (!graphAreaRef.current) return;

    const measure = () => {
      if (!graphAreaRef.current) return;
      const width = Math.max(1, graphAreaRef.current.clientWidth);
      const height = Math.max(1, graphAreaRef.current.clientHeight);
      setGraphDimensions({ width, height });
    };

    let rafId: number | null = null;
    const scheduleMeasure = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(measure);
    };

    scheduleMeasure();
    const timeoutId = setTimeout(measure, 120);
    const ro = new ResizeObserver(scheduleMeasure);
    if (graphAreaRef.current) ro.observe(graphAreaRef.current);
    window.addEventListener("resize", scheduleMeasure);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", scheduleMeasure);
      clearTimeout(timeoutId);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [graphUi.panelSplitRatio, stableGraphData.nodes.length]);

  useEffect(() => {
    const fg = getForceGraph();
    if (!fg || stableGraphData.nodes.length === 0) return;

    // Keep graph data updates isolated from force-parameter updates.
    fg.graphData(stableGraphData);
    fg.d3ReheatSimulation();
  }, [getForceGraph, stableGraphData]);

  useEffect(() => {
    const fg = getForceGraph();
    if (!fg || stableGraphData.nodes.length === 0) return;

    const nodeCount = stableGraphData.nodes.length;
    const fixedLinkDistanceScale = 2;
    const fixedRepulsionScale = 1.45;
    const avgCompositeRadius =
      stableGraphData.nodes.reduce((sum, rawNode) => {
        const node = rawNode as NodeObject;
        return sum + estimateCompositeRadius(node, graphUi.fontSize, graphUi.nodeSizeScale);
      }, 0) / Math.max(1, nodeCount);

    const charge = fg.d3Force("charge") as { strength?: (value: number) => void } | null;
    if (charge && typeof charge.strength === "function") {
      const baseStrength = Math.min(520, 120 + nodeCount * 12);
      const radiusFactor = Math.max(0.8, Math.min(2.2, avgCompositeRadius / 9));
      charge.strength(-baseStrength * radiusFactor * fixedRepulsionScale);
    }

    const link = fg.d3Force("link") as
      | {
          distance?: (value: number | ((l: unknown) => number)) => void;
          strength?: (value: number | ((l: unknown) => number)) => void;
        }
      | null;
    if (link && typeof link.distance === "function") {
      const baseDistance = Math.min(190, 82 + nodeCount * 2);
      const distance = Math.max(24, Math.min(1600, baseDistance * fixedLinkDistanceScale));
      // Use accessor form so distance updates are always re-bound in d3-force.
      link.distance(() => distance);
      if (typeof link.strength === "function") {
        const linkStrength = Math.max(0.35, Math.min(0.8, 0.62 - nodeCount * 0.006));
        link.strength(() => linkStrength);
      }
    }

    const collide = fg.d3Force("collide") as
      | { radius?: (fn: (node: NodeObject) => number) => void; iterations?: (value: number) => void }
      | null;

    if (collide) {
      if (typeof collide.radius === "function") {
        collide.radius((node: NodeObject) => estimateCompositeRadius(node, graphUi.fontSize, graphUi.nodeSizeScale) + 8);
      }
      if (typeof collide.iterations === "function") {
        collide.iterations(4);
      }
    }

    fg.d3ReheatSimulation();
    const timer = window.setTimeout(() => fg.d3ReheatSimulation(), 60);
    return () => window.clearTimeout(timer);
  }, [
    getForceGraph,
    graphUi.fontSize,
    graphUi.nodeSizeScale,
    stableGraphData.nodes,
    stableGraphData.links,
  ]);

  useEffect(() => {
    const fg = getForceGraph();
    if (!fg || stableGraphData.nodes.length === 0) return;

    const zoomKey = [
      stableGraphData.nodes.length,
      stableGraphData.links.length,
      graphDimensions.width,
      graphDimensions.height,
      resizeToken ?? 0,
    ].join(":");

    if (zoomKeyRef.current === zoomKey) return;
    zoomKeyRef.current = zoomKey;

    const timer = window.setTimeout(() => fg.zoomToFit(450, 48), 120);
    return () => window.clearTimeout(timer);
  }, [getForceGraph, graphDimensions.height, graphDimensions.width, resizeToken, stableGraphData.links.length, stableGraphData.nodes.length]);

  const handleNodeClick = useCallback(
    (node: NodeObject) => {
      if (!node.id) return;
      const slug = String(node.id);
      setSelectedNode(slug);
      onNodeClick(slug);
    },
    [onNodeClick, setSelectedNode]
  );

  const handleNodeHover = useCallback((node: NodeObject | null) => {
    setHoveredNode(node?.id ? String(node.id) : null);
  }, []);

  const linkColor = useCallback((link: LinkObject) => {
    switch (link.evidenceType) {
      case "EXTRACTED":
        return "rgba(96,165,250,0.55)";
      case "INFERRED":
        return "rgba(251,191,36,0.5)";
      case "AMBIGUOUS":
        return "rgba(248,113,113,0.45)";
      default:
        return "rgba(255,255,255,0.1)";
    }
  }, []);

  const linkWidth = useCallback((link: LinkObject) => {
    if (link.evidenceType === "EXTRACTED") return 1.8;
    if (link.evidenceType === "INFERRED") return 1.4;
    if (link.evidenceType === "AMBIGUOUS") return 1.2;
    return 1;
  }, []);

  const linkLineDash = useCallback((link: LinkObject) => {
    if (link.evidenceType === "INFERRED") return [5, 4];
    if (link.evidenceType === "AMBIGUOUS") return [2, 6];
    return null;
  }, []);

  const nodeCanvasObject = useCallback((node: NodeObject, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const label = node.label || String(node.id ?? "");
    const type = node.type || "concept";
    const linkCount = node.linkCount ?? 0;
    const x = node.x ?? 0;
    const y = node.y ?? 0;
    const id = String(node.id ?? "");

    const { fontSize, nodeSizeScale } = graphUiRef.current;
    const isSelected = selectedNodeRef.current === id;
    const isHovered = hoveredNodeRef.current === id;

    const color = NODE_COLORS[type] || "#60a5fa";
    const isOperational = Boolean(node.isOperational);

    const radius = Math.max(
      1.25,
      ((4 + Math.min(linkCount * 1.5, 10)) / Math.max(globalScale * 0.8, 1)) * nodeSizeScale
    );

    if (isSelected || isHovered) {
      const haloRadius = radius * 2.6;
      const grad = ctx.createRadialGradient(x, y, radius * 0.5, x, y, haloRadius);
      grad.addColorStop(0, `${color}50`);
      grad.addColorStop(1, "transparent");
      ctx.beginPath();
      ctx.arc(x, y, haloRadius, 0, 2 * Math.PI);
      ctx.fillStyle = grad;
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, 2 * Math.PI);
    if (isSelected) {
      ctx.fillStyle = "#ffffff";
    } else if (isHovered) {
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
    } else {
      ctx.fillStyle = isOperational ? `${color}88` : `${color}cc`;
      ctx.shadowBlur = 0;
    }
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, 2 * Math.PI);
    ctx.strokeStyle = isSelected ? "#ffffff" : isOperational ? `${color}aa` : color;
    ctx.lineWidth = Math.max(0.4, 1 / globalScale);
    ctx.stroke();

    const scaledFontSize = Math.max(4, fontSize / globalScale);
    const lineHeight = scaledFontSize * 1.15;
    const labelLines = splitLabelLines(label);

    ctx.font = `${scaledFontSize}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    const widths = labelLines.map((line) => ctx.measureText(line).width);
    const maxWidth = widths.length ? Math.max(...widths) : 0;
    const pad = Math.max(1.5 / globalScale, 1);
    const labelTop = y + radius + 3 / globalScale;
    const boxHeight = lineHeight * labelLines.length;

    ctx.fillStyle = "rgba(10,10,15,0.72)";
    ctx.fillRect(
      x - maxWidth / 2 - pad,
      labelTop - pad * 0.5,
      maxWidth + pad * 2,
      boxHeight + pad
    );

    ctx.fillStyle = isSelected
      ? "#ffffff"
      : isHovered
      ? "#e2e8f0"
      : "rgba(255,255,255,0.55)";

    for (let i = 0; i < labelLines.length; i += 1) {
      ctx.fillText(labelLines[i], x, labelTop + i * lineHeight);
    }
  }, []);

  if (stableGraphData.nodes.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-white/20">
        <p className="text-xs">그래프 데이터 없음</p>
        <p className="text-[10px] text-white/10">위키 페이지를 추가하면 여기에 표시됩니다.</p>
      </div>
    );
  }

  const graphHeightPercent = Math.round(graphUi.panelSplitRatio * 100);
  const MIN_GRAPH_VIEW_WIDTH = 280;
  const legendWidthPx = Math.round(MIN_GRAPH_VIEW_WIDTH * 0.4);
  const controlsWidthPx = Math.round(MIN_GRAPH_VIEW_WIDTH * 0.6);

  return (
    <div ref={rootRef} className="flex h-full w-full min-h-0 flex-col">
      <div ref={graphAreaRef} className="relative min-h-[180px]" style={{ height: `${graphHeightPercent}%` }}>
        <ForceGraph2D
          key={graphRenderKey}
          ref={fgRef}
          graphData={stableGraphData}
          width={graphDimensions.width}
          height={graphDimensions.height}
          onNodeClick={handleNodeClick}
          onNodeHover={handleNodeHover}
          nodeCanvasObject={nodeCanvasObject}
          nodeCanvasObjectMode={NODE_CANVAS_MODE}
          linkColor={linkColor}
          linkWidth={linkWidth}
          linkLineDash={linkLineDash}
          backgroundColor="#0d0d14"
          warmupTicks={80}
          cooldownTicks={300}
          d3AlphaDecay={0.018}
          d3VelocityDecay={graphUi.velocityDecay}
          enableNodeDrag
          enableZoomInteraction
          enablePanInteraction
          minZoom={0.3}
          maxZoom={8}
        />

        <button
          type="button"
          onClick={() => setGraphUiPartial({ showOperationalNodes: !graphUi.showOperationalNodes })}
          className="absolute left-2 top-2 z-10 rounded border border-white/15 bg-black/50 px-2 py-1 text-[10px] text-white/70 hover:border-white/35 hover:text-white"
        >
          {graphUi.showOperationalNodes ? "Hide index/log" : "Show index/log"}
        </button>

        <div className="pointer-events-none absolute right-2 top-2 text-[9px] text-white/25">
          {stableGraphData.nodes.length} nodes · {stableGraphData.links.length} links
        </div>
      </div>

      <div className="flex min-h-0 flex-1 items-start justify-between gap-2 border-t border-white/10 bg-[#0b0b12] p-2">
        <section
          className="shrink-0 rounded-md border border-white/10 bg-black/30 px-2 py-1.5"
          style={{ width: `${legendWidthPx}px` }}
        >
          <div className="mb-1 text-[10px] font-medium text-white/60">Legend</div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-white/40">
            {LEGEND_TYPES.map((type) => (
              <div key={type} className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: NODE_COLORS[type] }} />
                <span className="capitalize">
                  {type === "index" || type === "log" ? `${type} (operational)` : type}
                </span>
              </div>
            ))}
            <div className="flex items-center gap-1">
              <span className="inline-block h-px w-3 bg-[#60a5fa]" />Extracted
            </div>
            <div className="flex items-center gap-1">
              <span className="inline-block h-px w-3 border-t border-dashed border-amber-300" />Inferred
            </div>
            <div className="flex items-center gap-1">
              <span className="inline-block h-px w-3 border-t border-dashed border-red-400" />Ambiguous
            </div>
          </div>
        </section>

        <section
          className="shrink-0 rounded-md border border-white/10 bg-black/45 p-2"
          style={{ width: `${controlsWidthPx}px` }}
        >
          <h3 className="mb-1.5 text-[10px] font-medium text-white/70">Graph Controls</h3>

          <div className="mb-1.5">
            <label className="mb-0.5 block text-[10px] text-white/55">Font size ({pendingControls.fontSize.toFixed(1)}px)</label>
            <input
              type="range"
              min={6}
              max={16}
              step={0.5}
              value={pendingControls.fontSize}
              onChange={(e) => setPendingControls((prev) => ({ ...prev, fontSize: Number(e.target.value) }))}
              onPointerUp={commitPendingControls}
              onKeyUp={commitPendingControls}
              className="graph-slider"
            />
          </div>

          <div className="mb-1.5">
            <label className="mb-0.5 block text-[10px] text-white/55">Node size ({pendingControls.nodeSizeScale.toFixed(2)}x)</label>
            <input
              type="range"
              min={0.12}
              max={1.2}
              step={0.05}
              value={pendingControls.nodeSizeScale}
              onChange={(e) => setPendingControls((prev) => ({ ...prev, nodeSizeScale: Number(e.target.value) }))}
              onPointerUp={commitPendingControls}
              onKeyUp={commitPendingControls}
              className="graph-slider"
            />
          </div>

          <div>
            <label className="mb-0.5 block text-[10px] text-white/55">Velocity decay ({pendingControls.velocityDecay.toFixed(2)})</label>
            <input
              type="range"
              min={0.2}
              max={0.7}
              step={0.01}
              value={pendingControls.velocityDecay}
              onChange={(e) => setPendingControls((prev) => ({ ...prev, velocityDecay: Number(e.target.value) }))}
              onPointerUp={commitPendingControls}
              onKeyUp={commitPendingControls}
              className="graph-slider"
            />
          </div>
        </section>
      </div>
    </div>
  );
}
