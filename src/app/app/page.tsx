"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Sidebar from "@/components/layout/Sidebar";
import EditorPane from "@/components/layout/EditorPane";
import ChatPane from "@/components/layout/ChatPane";
import GraphView from "@/components/graph/GraphView";
import DropZone from "@/components/ingest/DropZone";
import CompileModal from "@/components/compile/CompileModal";
import NewPageModal from "@/components/NewPageModal";
import LintPanel from "@/components/LintPanel";
import LLMSettings from "@/components/LLMSettings";
import StorageGuard from "@/components/StorageGuard";
import StorageSettings from "@/components/StorageSettings";
import { useWikiStore } from "@/stores/wiki-store";
import { useGraphStore } from "@/stores/graph-store";
import { useStorageStore } from "@/stores/storage-store";
import { buildGraphData, parseWikilinks } from "@/lib/wiki/parser";
import { toSlug } from "@/lib/utils/markdown";
import {
  AlertTriangle,
  MessageSquare,
  Network,
  PanelRightClose,
  PanelRight,
  Settings,
} from "lucide-react";

type RightTab = "chat" | "graph";

function IDELayout() {
  const { fetchPage, fetchPages, pages } = useWikiStore();
  const { fetchGraph, setGraphData } = useGraphStore();
  const { isReady, contentHandle } = useStorageStore();
  const [showIngest, setShowIngest] = useState(false);
  const [showCompile, setShowCompile] = useState(false);
  const [showNewPage, setShowNewPage] = useState(false);
  const [showLint, setShowLint] = useState(false);
  const [showLLMSettings, setShowLLMSettings] = useState(false);
  const [showStorageSettings, setShowStorageSettings] = useState(false);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [rightTab, setRightTab] = useState<RightTab>("chat");
  const [backlinks, setBacklinks] = useState<string[]>([]);
  const [rightPanelWidth, setRightPanelWidth] = useState(420);
  const dragModeRef = useRef<"editor" | null>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);

  const handlePageSelect = useCallback(
    async (slug: string) => {
      await fetchPage(slug);
      // Compute backlinks from loaded pages
      const currentPages = useWikiStore.getState().pages;
      const bl: string[] = [];
      for (const p of currentPages) {
        if (p.slug === slug) continue;
        const links = parseWikilinks(p.content);
        for (const link of links) {
          if (toSlug(link.target) === slug) {
            bl.push(p.slug);
            break;
          }
        }
      }
      setBacklinks(bl);
    },
    [fetchPage]
  );

  const handleIngestComplete = useCallback(() => {
    fetchPages();
    fetchGraph();
  }, [fetchPages, fetchGraph]);

  const handleCompileComplete = useCallback(() => {
    fetchPages();
    fetchGraph();
  }, [fetchPages, fetchGraph]);

  const handlePageSave = useCallback(() => {
    fetchGraph();
  }, [fetchGraph]);

  const handlePageDelete = useCallback(() => {
    fetchGraph();
  }, [fetchGraph]);

  useEffect(() => {
    if (!isReady || !contentHandle) return;
    fetchPages();
    fetchGraph();
    const timer = window.setTimeout(() => {
      void handlePageSelect("index");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [contentHandle, fetchGraph, fetchPages, handlePageSelect, isReady]);

  // Keep graph view in sync with sidebar/editor pages.
  // This avoids graph desync if direct file scan is delayed.
  useEffect(() => {
    if (!isReady) return;
    setGraphData(buildGraphData(pages));
  }, [isReady, pages, setGraphData]);

  useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      if (!showRightPanel || !dragModeRef.current) return;

      if (dragModeRef.current === "editor") {
        const workspace = workspaceRef.current;
        if (!workspace) return;
        const bounds = workspace.getBoundingClientRect();
        if (bounds.width <= 0) return;
        const nextWidth = bounds.right - event.clientX;
        const maxWidth = Math.max(320, bounds.width - 360);
        setRightPanelWidth(Math.max(320, Math.min(maxWidth, nextWidth)));
      }

    };

    const stopDrag = () => {
      dragModeRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", stopDrag);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", stopDrag);
    };
  }, [showRightPanel]);

  const beginDrag = useCallback((mode: "editor") => {
    dragModeRef.current = mode;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  return (
    <div className="flex h-screen bg-[#0a0a0f]">
      {/* Sidebar */}
      <div className="w-56 shrink-0">
        <Sidebar
          onPageSelect={handlePageSelect}
          onIngestClick={() => setShowIngest(true)}
          onNewPage={() => setShowNewPage(true)}
          onSettingsClick={() => setShowLLMSettings(true)}
          onStorageClick={() => setShowStorageSettings(true)}
          onCompileClick={() => setShowCompile(true)}
        />
      </div>

      <div ref={workspaceRef} className="flex-1 min-w-0 flex">
      {/* Main View (Text) */}
      <div
        className="min-w-0 flex-1 flex flex-col"
      >
        <div className="flex-1 min-h-0">
          <EditorPane
            backlinks={backlinks}
            onLinkClick={handlePageSelect}
            onSave={handlePageSave}
            onDelete={handlePageDelete}
          />
        </div>
      </div>

      {/* Divider: Text ↔ Right stack */}
      {showRightPanel && (
        <div
          className="w-1.5 cursor-col-resize bg-white/5 hover:bg-blue-500/40 transition-colors"
          onPointerDown={() => beginDrag("editor")}
          role="separator"
          aria-label="Resize text and right panel"
          aria-orientation="vertical"
        />
      )}

      {/* Right Panel (Chat / Graph tabs) */}
      {showRightPanel && (
        <div
          id="right-stack-panel"
          className="min-w-[280px] shrink-0 flex flex-col border-l border-white/10"
          style={{ width: `${rightPanelWidth}px` }}
        >
          {/* Tab header */}
          <div className="flex items-center border-b border-white/10 bg-[#0d0d14]">
            <div className="flex-1 flex items-center">
              <button
                onClick={() => setRightTab("chat")}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs border-b-2 transition-colors ${
                  rightTab === "chat"
                    ? "text-white/90 border-blue-500"
                    : "text-white/35 border-transparent hover:text-white/60"
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Chat
              </button>
              <button
                onClick={() => setRightTab("graph")}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs border-b-2 transition-colors ${
                  rightTab === "graph"
                    ? "text-white/90 border-blue-500"
                    : "text-white/35 border-transparent hover:text-white/60"
                }`}
              >
                <Network className="w-3.5 h-3.5" />
                Graph
              </button>
            </div>
            <button
              onClick={() => setShowLint(true)}
              className="px-2 py-2 text-white/30 hover:text-orange-400"
              title="Run Lint"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setShowLLMSettings(true)}
              className="px-2 py-2 text-white/30 hover:text-white/60"
              title="LLM Settings"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-hidden">
            {rightTab === "chat" ? (
              <ChatPane onLinkClick={handlePageSelect} />
            ) : (
              <GraphView onNodeClick={handlePageSelect} resizeToken={rightPanelWidth} />
            )}
          </div>

          {/* Divider: Chat ↕ Graph */}
          <div
            className="h-1.5 cursor-row-resize bg-white/5 hover:bg-blue-500/40 transition-colors"
            onPointerDown={() => beginDrag("chat")}
            role="separator"
            aria-label="Resize chat and graph panel"
            aria-orientation="horizontal"
          />

          {/* Graph */}
          <div className="min-h-0 overflow-hidden" style={{ height: `${100 - chatHeight}%` }}>
            <GraphView onNodeClick={handlePageSelect} />
          </div>
        </div>
      )}
      </div>

      {/* Right panel toggle */}
      <button
        onClick={() => setShowRightPanel(!showRightPanel)}
        className="fixed right-2 bottom-2 p-1.5 rounded bg-white/5 text-white/30 hover:text-white/60 hover:bg-white/10 z-40"
        title={showRightPanel ? "Hide panel" : "Show panel"}
      >
        {showRightPanel ? (
          <PanelRightClose className="w-4 h-4" />
        ) : (
          <PanelRight className="w-4 h-4" />
        )}
      </button>

      {/* Modals */}
      {showIngest && (
        <DropZone
          onClose={() => setShowIngest(false)}
          onComplete={handleIngestComplete}
        />
      )}
      {showNewPage && (
        <NewPageModal
          onClose={() => setShowNewPage(false)}
          onCreated={(slug) => {
            setShowNewPage(false);
            handlePageSelect(slug);
            fetchPages();
            fetchGraph();
          }}
        />
      )}
      {showCompile && (
        <CompileModal
          onClose={() => setShowCompile(false)}
          onComplete={handleCompileComplete}
        />
      )}
      {showLint && <LintPanel onClose={() => setShowLint(false)} />}
      {showLLMSettings && (
        <LLMSettings onClose={() => setShowLLMSettings(false)} />
      )}
      {showStorageSettings && (
        <StorageSettings onClose={() => setShowStorageSettings(false)} />
      )}
    </div>
  );
}

export default function Home() {
  return (
    <StorageGuard>
      <IDELayout />
    </StorageGuard>
  );
}
