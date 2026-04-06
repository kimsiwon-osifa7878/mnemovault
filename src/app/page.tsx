"use client";

import { useState, useCallback, useEffect } from "react";
import Sidebar from "@/components/layout/Sidebar";
import EditorPane from "@/components/layout/EditorPane";
import ChatPane from "@/components/layout/ChatPane";
import GraphView from "@/components/graph/GraphView";
import DropZone from "@/components/ingest/DropZone";
import NewPageModal from "@/components/NewPageModal";
import LintPanel from "@/components/LintPanel";
import { useWikiStore } from "@/stores/wiki-store";
import { useGraphStore } from "@/stores/graph-store";
import { Network, AlertTriangle, PanelRightClose, PanelRight } from "lucide-react";

export default function Home() {
  const { fetchPage, fetchPages, currentSlug } = useWikiStore();
  const { fetchGraph } = useGraphStore();
  const [showIngest, setShowIngest] = useState(false);
  const [showNewPage, setShowNewPage] = useState(false);
  const [showLint, setShowLint] = useState(false);
  const [showGraph, setShowGraph] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [backlinks, setBacklinks] = useState<string[]>([]);

  const handlePageSelect = useCallback(
    async (slug: string) => {
      await fetchPage(slug);
      // Fetch backlinks
      try {
        const res = await fetch(`/api/wiki/${slug}`);
        if (res.ok) {
          const data = await res.json();
          setBacklinks(data.backlinks || []);
        }
      } catch {
        setBacklinks([]);
      }
    },
    [fetchPage]
  );

  const handleIngestComplete = useCallback(() => {
    fetchPages();
    fetchGraph();
  }, [fetchPages, fetchGraph]);

  useEffect(() => {
    // Load index page by default
    handlePageSelect("index");
  }, [handlePageSelect]);

  return (
    <div className="flex h-screen bg-[#0a0a0f]">
      {/* Sidebar */}
      <div className="w-56 shrink-0">
        <Sidebar
          onPageSelect={handlePageSelect}
          onIngestClick={() => setShowIngest(true)}
          onNewPage={() => setShowNewPage(true)}
        />
      </div>

      {/* Editor */}
      <div className="flex-1 min-w-0">
        <EditorPane backlinks={backlinks} onLinkClick={handlePageSelect} />
      </div>

      {/* Right Panel (Chat + Graph) */}
      {showRightPanel && (
        <div className="w-80 shrink-0 flex flex-col border-l border-white/10">
          {/* Graph / Chat toggle */}
          <div className="flex items-center border-b border-white/10 bg-[#0d0d14]">
            <button
              onClick={() => setShowGraph(true)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs ${
                showGraph
                  ? "text-white/80 border-b-2 border-blue-500"
                  : "text-white/30 hover:text-white/50"
              }`}
            >
              <Network className="w-3.5 h-3.5" />
              Graph
            </button>
            <button
              onClick={() => setShowGraph(false)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs ${
                !showGraph
                  ? "text-white/80 border-b-2 border-blue-500"
                  : "text-white/30 hover:text-white/50"
              }`}
            >
              Chat
            </button>
            <button
              onClick={() => setShowLint(true)}
              className="px-2 py-2 text-white/30 hover:text-orange-400"
              title="Run Lint"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden">
            {showGraph ? (
              <GraphView onNodeClick={handlePageSelect} />
            ) : (
              <ChatPane onLinkClick={handlePageSelect} />
            )}
          </div>
        </div>
      )}

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
          }}
        />
      )}
      {showLint && <LintPanel onClose={() => setShowLint(false)} />}
    </div>
  );
}
