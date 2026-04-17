"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useStorageStore } from "@/stores/storage-store";
import * as clientFs from "@/lib/storage/client-fs";
import { toSlug } from "@/lib/utils/markdown";

interface NewPageModalProps {
  onClose: () => void;
  onCreated: (slug: string) => void;
}

export default function NewPageModal({ onClose, onCreated }: NewPageModalProps) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<"concept" | "entity" | "source" | "analysis">("concept");
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    if (!title.trim()) return;
    setIsCreating(true);
    try {
      const root = useStorageStore.getState().contentHandle;
      if (!root) throw new Error("Storage not connected");

      const baseSlug = toSlug(title.trim());
      const wikiFiles = await clientFs.listFiles(root, "wiki");
      const takenSlugs = new Set(
        wikiFiles.map((filePath) => (filePath.split("/").pop() || filePath).replace(/\.md$/, ""))
      );
      let slug = baseSlug;
      if (takenSlugs.has(slug)) {
        const withType = `${baseSlug}-${type}`;
        slug = withType;
        let attempt = 2;
        while (takenSlugs.has(slug)) {
          slug = `${withType}-${attempt}`;
          attempt += 1;
        }
      }
      const today = new Date().toISOString().split("T")[0];
      const folder = type === "entity" ? "entities" : type === "concept" ? "concepts" : type === "source" ? "sources" : "analyses";
      const content = `---
title: "${title.trim()}"
type: ${type}
created: ${today}
updated: ${today}
tags: []
confidence: medium
---

# ${title.trim()}

`;
      await clientFs.writeFile(root, `wiki/${folder}/${slug}.md`, content);
      onCreated(slug);
    } catch {
      // handle error
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-[#0d0d14] border border-white/10 rounded-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-white/80">New Page</h2>
          <button onClick={onClose} className="p-1 rounded text-white/30 hover:text-white/60">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-white/40 block mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Page title..."
              className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white/80 placeholder-white/30 focus:border-blue-500/50 focus:outline-none"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
          </div>

          <div>
            <label className="text-xs text-white/40 block mb-1">Type</label>
            <div className="flex gap-2">
              {(["concept", "entity", "source", "analysis"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`px-3 py-1 rounded text-xs ${
                    type === t
                      ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                      : "bg-white/5 text-white/40 border border-white/10"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-1.5 rounded text-sm text-white/40 hover:text-white/60">
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!title.trim() || isCreating}
            className="px-4 py-1.5 rounded text-sm bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 disabled:opacity-30"
          >
            {isCreating ? "Creating..." : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
