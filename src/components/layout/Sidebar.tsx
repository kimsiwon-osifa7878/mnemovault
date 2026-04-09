"use client";

import { useEffect, useState } from "react";
import { useWikiStore } from "@/stores/wiki-store";
import { useLLMStore } from "@/stores/llm-store";
import { useStorageStore } from "@/stores/storage-store";
import {
  FileText,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Plus,
  Search,
  Upload,
  Zap,
} from "lucide-react";
import { getUncompiledCount } from "@/lib/compile/get-uncompiled";

interface SidebarProps {
  onPageSelect: (slug: string) => void;
  onIngestClick: () => void;
  onNewPage: () => void;
  onSettingsClick?: () => void;
  onStorageClick?: () => void;
  onCompileClick?: () => void;
}

interface TreeSection {
  label: string;
  type: string;
  pages: { slug: string; title: string }[];
}

export default function Sidebar({
  onPageSelect,
  onIngestClick,
  onNewPage,
  onSettingsClick,
  onStorageClick,
  onCompileClick,
}: SidebarProps) {
  const { pages, currentSlug, fetchPages } = useWikiStore();
  const { provider, ollamaModel, openrouterModel } = useLLMStore();
  const { folderName, contentHandle } = useStorageStore();
  const [uncompiledCount, setUncompiledCount] = useState(0);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(["concepts", "entities", "sources", "analyses"])
  );
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchPages();
  }, [fetchPages]);

  useEffect(() => {
    if (!contentHandle) return;
    getUncompiledCount(contentHandle).then(setUncompiledCount).catch(() => {});
  }, [contentHandle, pages]);

  const sections: TreeSection[] = [
    {
      label: "Concepts",
      type: "concept",
      pages: pages
        .filter((p) => p.frontmatter.type === "concept")
        .map((p) => ({ slug: p.slug, title: p.frontmatter.title })),
    },
    {
      label: "Entities",
      type: "entity",
      pages: pages
        .filter((p) => p.frontmatter.type === "entity")
        .map((p) => ({ slug: p.slug, title: p.frontmatter.title })),
    },
    {
      label: "Sources",
      type: "source",
      pages: pages
        .filter((p) => p.frontmatter.type === "source")
        .map((p) => ({ slug: p.slug, title: p.frontmatter.title })),
    },
    {
      label: "Analyses",
      type: "analysis",
      pages: pages
        .filter((p) => p.frontmatter.type === "analysis")
        .map((p) => ({ slug: p.slug, title: p.frontmatter.title })),
    },
  ];

  const filteredSections = sections.map((section) => ({
    ...section,
    pages: searchQuery
      ? section.pages.filter(
          (p) =>
            p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.slug.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : section.pages,
  }));

  const toggleSection = (type: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const specialPages = pages.filter(
    (p) => p.slug === "index" || p.slug === "log"
  );

  return (
    <div className="flex flex-col h-full bg-[#0d0d14] border-r border-white/10">
      {/* Header */}
      <div className="p-3 border-b border-white/10">
        <h2 className="text-sm font-semibold text-white/80 tracking-wider uppercase">
          MnemoVault
        </h2>
      </div>

      {/* Search */}
      <div className="p-2 border-b border-white/10">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
          <input
            type="text"
            placeholder="Search pages..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white/5 rounded pl-7 pr-2 py-1.5 text-xs text-white/80 placeholder-white/30 border border-white/10 focus:border-blue-500/50 focus:outline-none"
          />
        </div>
      </div>

      {/* Special pages */}
      <div className="px-2 py-1 border-b border-white/10">
        {specialPages.map((p) => (
          <button
            key={p.slug}
            onClick={() => onPageSelect(p.slug)}
            className={`flex items-center gap-2 w-full px-2 py-1 rounded text-xs ${
              currentSlug === p.slug
                ? "bg-blue-500/20 text-blue-400"
                : "text-white/60 hover:bg-white/5 hover:text-white/80"
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            {p.frontmatter.title}
          </button>
        ))}
      </div>

      {/* File tree */}
      <div className="flex-1 overflow-y-auto px-2 py-1">
        {filteredSections.map((section) => (
          <div key={section.type} className="mb-1">
            <button
              onClick={() => toggleSection(section.type)}
              className="flex items-center gap-1 w-full px-1 py-1 text-xs text-white/50 hover:text-white/80"
            >
              {expandedSections.has(section.type) ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
              <FolderOpen className="w-3.5 h-3.5" />
              <span className="font-medium">{section.label}</span>
              <span className="ml-auto text-white/30">
                {section.pages.length}
              </span>
            </button>
            {expandedSections.has(section.type) && (
              <div className="ml-3">
                {section.pages.map((p) => (
                  <button
                    key={p.slug}
                    onClick={() => onPageSelect(p.slug)}
                    className={`flex items-center gap-2 w-full px-2 py-0.5 rounded text-xs truncate ${
                      currentSlug === p.slug
                        ? "bg-blue-500/20 text-blue-400"
                        : "text-white/60 hover:bg-white/5 hover:text-white/80"
                    }`}
                  >
                    <FileText className="w-3 h-3 shrink-0" />
                    <span className="truncate">{p.title}</span>
                  </button>
                ))}
                {section.pages.length === 0 && (
                  <p className="text-xs text-white/20 px-2 py-1 italic">
                    empty
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="p-2 border-t border-white/10 space-y-1">
        {/* Storage folder indicator */}
        {folderName && (
          <button
            onClick={onStorageClick}
            className="flex items-center gap-2 w-full px-3 py-1.5 rounded text-xs bg-white/[0.02] text-white/40 hover:bg-white/5 hover:text-white/60 mb-1"
          >
            <FolderOpen className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{folderName}</span>
          </button>
        )}
        {/* Provider indicator */}
        <button
          onClick={onSettingsClick}
          className="flex items-center gap-2 w-full px-3 py-1.5 rounded text-xs bg-white/[0.02] text-white/40 hover:bg-white/5 hover:text-white/60 mb-1"
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              provider === "ollama" ? "bg-emerald-400" : "bg-violet-400"
            }`}
          />
          <span className="truncate">
            {provider === "ollama" ? `Ollama · ${ollamaModel}` : `OpenRouter · ${openrouterModel}`}
          </span>
        </button>
        <button
          onClick={onNewPage}
          className="flex items-center gap-2 w-full px-3 py-1.5 rounded text-xs bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
        >
          <Plus className="w-3.5 h-3.5" />
          New Page
        </button>
        <button
          onClick={onCompileClick}
          className="flex items-center gap-2 w-full px-3 py-1.5 rounded text-xs bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
        >
          <Zap className="w-3.5 h-3.5" />
          Compile
          {uncompiledCount > 0 && (
            <span className="ml-auto px-1.5 py-0.5 rounded-full bg-amber-500/20 text-[10px] font-medium">
              {uncompiledCount}
            </span>
          )}
        </button>
        <button
          onClick={onIngestClick}
          className="flex items-center gap-2 w-full px-3 py-1.5 rounded text-xs bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
        >
          <Upload className="w-3.5 h-3.5" />
          Ingest Source
        </button>
      </div>
    </div>
  );
}
