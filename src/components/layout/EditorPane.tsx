"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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

const MIRROR_STYLE_KEYS = [
  "fontFamily",
  "fontSize",
  "lineHeight",
  "letterSpacing",
  "tabSize",
  "whiteSpace",
  "wordBreak",
  "fontVariantLigatures",
] as const;

const CODE_STYLE_KEYS = ["fontFamily", "fontSize", "lineHeight", "letterSpacing"] as const;

function normalizeStyleValue(key: string, value: string): string {
  const compact = value.trim().toLowerCase();
  if (key === "fontFamily") {
    return compact.replace(/["']/g, "").replace(/\s*,\s*/g, ",");
  }
  return compact.replace(/\s+/g, " ");
}

function hasMirrorMismatch(
  textarea: HTMLElement,
  textLayer: HTMLElement,
  pre: HTMLElement,
  code: HTMLElement
): boolean {
  const textareaStyle = window.getComputedStyle(textarea);
  const textStyle = window.getComputedStyle(textLayer);
  const codeStyle = window.getComputedStyle(code);

  for (const key of MIRROR_STYLE_KEYS) {
    if (normalizeStyleValue(key, textareaStyle[key]) !== normalizeStyleValue(key, textStyle[key])) {
      return true;
    }
  }

  for (const key of CODE_STYLE_KEYS) {
    if (normalizeStyleValue(key, textareaStyle[key]) !== normalizeStyleValue(key, codeStyle[key])) {
      return true;
    }
  }

  const lineHeight = Number.parseFloat(textareaStyle.lineHeight) || 20;
  const scrollGap = Math.abs(textarea.scrollHeight - pre.scrollHeight);
  return scrollGap > lineHeight * 1.5;
}

export default function EditorPane({ backlinks, onLinkClick, onSave, onDelete }: EditorPaneProps) {
  const { currentPage, currentSlug, savePage, deletePage, isLoading } =
    useWikiStore();
  const [mode, setMode] = useState<ViewMode>("preview");
  const [editContent, setEditContent] = useState("");
  const [hasChanges, setHasChanges] = useState(false);
  const [highlightFallbackBySlug, setHighlightFallbackBySlug] = useState<Record<string, true>>({});
  const editorHostRef = useRef<HTMLDivElement>(null);
  const isHighlightEnabled = currentSlug ? !highlightFallbackBySlug[currentSlug] : true;

  useEffect(() => {
    if (currentPage) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
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

  useEffect(() => {
    if (!currentSlug || !isHighlightEnabled || mode === "preview") {
      return;
    }

    let cancelled = false;

    const check = async (attempt = 0) => {
      if ("fonts" in document) {
        try {
          await Promise.race([
            document.fonts.ready,
            new Promise((resolve) => window.setTimeout(resolve, 250)),
          ]);
        } catch {
          // Ignore fonts API failures; fall back to immediate check.
        }
      }

      await new Promise((resolve) => window.requestAnimationFrame(() => resolve(undefined)));

      if (cancelled) return;
      const host = editorHostRef.current;
      if (!host) return;

      const textLayer = host.querySelector<HTMLElement>(".w-md-editor-text");
      const textarea = host.querySelector<HTMLTextAreaElement>(".w-md-editor-text-input");
      const pre = host.querySelector<HTMLElement>(".w-md-editor-text-pre");
      const code = host.querySelector<HTMLElement>(".w-md-editor-text-pre > code");
      if (!textLayer || !textarea || !pre || !code) {
        if (attempt < 8) {
          window.setTimeout(() => {
            void check(attempt + 1);
          }, 80);
        }
        return;
      }

      const firstMismatch = hasMirrorMismatch(textarea, textLayer, pre, code);
      if (!firstMismatch) return;

      await new Promise((resolve) => window.setTimeout(resolve, 100));
      if (cancelled) return;

      const secondTextLayer = host.querySelector<HTMLElement>(".w-md-editor-text");
      const secondTextarea = host.querySelector<HTMLTextAreaElement>(".w-md-editor-text-input");
      const secondPre = host.querySelector<HTMLElement>(".w-md-editor-text-pre");
      const secondCode = host.querySelector<HTMLElement>(".w-md-editor-text-pre > code");
      if (!secondTextLayer || !secondTextarea || !secondPre || !secondCode) return;

      if (!hasMirrorMismatch(secondTextarea, secondTextLayer, secondPre, secondCode)) return;

      setHighlightFallbackBySlug((prev) => {
        if (prev[currentSlug]) return prev;
        return { ...prev, [currentSlug]: true };
      });
    };

    const timer = window.setTimeout(() => {
      void check();
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [currentSlug, editContent, isHighlightEnabled, mode]);

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
          {currentPage.sourceKind === "meta" && (
            <span className="px-1.5 py-0.5 text-[10px] rounded bg-white/10 text-white/40">
              {currentPage.path}
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
            disabled={!currentPage.editable || !hasChanges || isLoading}
            className="p-1.5 rounded text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Save (Ctrl+S)"
          >
            <Save className="w-4 h-4" />
          </button>
          <button
            onClick={handleDelete}
            disabled={!currentPage.editable}
            className="p-1.5 rounded text-red-400 hover:bg-red-500/10 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {mode === "edit" && (
          <div
            ref={editorHostRef}
            className="h-full md-editor-scope"
            data-color-mode="dark"
            data-highlight-mode={isHighlightEnabled ? "on" : "off"}
            data-testid="md-editor-host"
          >
            <MDEditor
              value={editContent}
              onChange={(val) => {
                setEditContent(val || "");
                setHasChanges(true);
              }}
              height="100%"
              preview="edit"
              highlightEnable={isHighlightEnabled}
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
            <div
              ref={editorHostRef}
              className="w-1/2 h-full md-editor-scope"
              data-color-mode="dark"
              data-highlight-mode={isHighlightEnabled ? "on" : "off"}
              data-testid="md-editor-host"
            >
              <MDEditor
                value={editContent}
                onChange={(val) => {
                  setEditContent(val || "");
                  setHasChanges(true);
                }}
                height="100%"
                preview="edit"
                highlightEnable={isHighlightEnabled}
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
