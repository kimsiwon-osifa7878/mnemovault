"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { useWikiStore } from "@/stores/wiki-store";
import WikiRenderer from "@/components/markdown/WikiRenderer";
import Backlinks from "@/components/markdown/Backlinks";
import { Eye, Edit3, Save, Trash2, Columns } from "lucide-react";

const MDEditor = dynamic(() => import("@uiw/react-md-editor"), { ssr: false });

type ViewMode = "edit" | "preview" | "split";

interface EditorPaneProps {
  backlinks: string[];
  onLinkClick: (slug: string) => void;
  onSave?: () => void;
  onDelete?: () => void;
}

export default function EditorPane({ backlinks, onLinkClick, onSave, onDelete }: EditorPaneProps) {
  const { currentPage, currentSlug, savePage, deletePage, isLoading } =
    useWikiStore();
  const [mode, setMode] = useState<ViewMode>("preview");
  const [editContent, setEditContent] = useState("");
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (currentPage) {
      setEditContent(currentPage.rawContent);
      setHasChanges(false);
    }
  }, [currentPage]);

  const handleSave = useCallback(async () => {
    if (currentSlug && editContent) {
      await savePage(currentSlug, editContent);
      setHasChanges(false);
      onSave?.();
    }
  }, [currentSlug, editContent, savePage, onSave]);

  const handleDelete = useCallback(async () => {
    if (currentSlug && confirm("Are you sure you want to delete this page?")) {
      await deletePage(currentSlug);
      onDelete?.();
    }
  }, [currentSlug, deletePage, onDelete]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSave]);

  if (!currentPage) {
    return (
      <div className="flex items-center justify-center h-full text-white/30">
        <div className="text-center">
          <p className="text-lg mb-2">No page selected</p>
          <p className="text-sm">Select a page from the sidebar or create a new one</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#0a0a0f]">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 bg-[#0d0d14]">
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-medium text-white/80">
            {currentPage.frontmatter.title}
          </h1>
          {currentPage.frontmatter.type && (
            <span className="px-1.5 py-0.5 text-[10px] rounded bg-white/10 text-white/40 uppercase">
              {currentPage.frontmatter.type}
            </span>
          )}
          {hasChanges && (
            <span className="w-2 h-2 rounded-full bg-orange-400" title="Unsaved changes" />
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMode("edit")}
            className={`p-1.5 rounded ${
              mode === "edit" ? "bg-white/10 text-white" : "text-white/40 hover:text-white/70"
            }`}
            title="Edit"
          >
            <Edit3 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setMode("preview")}
            className={`p-1.5 rounded ${
              mode === "preview" ? "bg-white/10 text-white" : "text-white/40 hover:text-white/70"
            }`}
            title="Preview"
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            onClick={() => setMode("split")}
            className={`p-1.5 rounded ${
              mode === "split" ? "bg-white/10 text-white" : "text-white/40 hover:text-white/70"
            }`}
            title="Split"
          >
            <Columns className="w-4 h-4" />
          </button>
          <div className="w-px h-4 bg-white/10 mx-1" />
          <button
            onClick={handleSave}
            disabled={!hasChanges || isLoading}
            className="p-1.5 rounded text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Save (Ctrl+S)"
          >
            <Save className="w-4 h-4" />
          </button>
          <button
            onClick={handleDelete}
            className="p-1.5 rounded text-red-400 hover:bg-red-500/10"
            title="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {mode === "edit" && (
          <div className="h-full" data-color-mode="dark">
            <MDEditor
              value={editContent}
              onChange={(val) => {
                setEditContent(val || "");
                setHasChanges(true);
              }}
              height="100%"
              preview="edit"
              hideToolbar={false}
              className="!bg-[#0a0a0f] !border-none"
            />
          </div>
        )}
        {mode === "preview" && (
          <div className="h-full overflow-y-auto p-6">
            <WikiRenderer content={currentPage.content} onLinkClick={onLinkClick} />
            <Backlinks backlinks={backlinks} onLinkClick={onLinkClick} />
          </div>
        )}
        {mode === "split" && (
          <div className="flex h-full divide-x divide-white/10">
            <div className="w-1/2 h-full" data-color-mode="dark">
              <MDEditor
                value={editContent}
                onChange={(val) => {
                  setEditContent(val || "");
                  setHasChanges(true);
                }}
                height="100%"
                preview="edit"
                hideToolbar
                className="!bg-[#0a0a0f] !border-none"
              />
            </div>
            <div className="w-1/2 h-full overflow-y-auto p-6">
              <WikiRenderer content={currentPage.content} onLinkClick={onLinkClick} />
              <Backlinks backlinks={backlinks} onLinkClick={onLinkClick} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
