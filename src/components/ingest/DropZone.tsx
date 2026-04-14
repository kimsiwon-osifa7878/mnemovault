"use client";

import { useState, useCallback } from "react";
import { Upload, FileText, X } from "lucide-react";
import IngestStatus from "./IngestStatus";
import { useStorageStore } from "@/stores/storage-store";
import * as clientFs from "@/lib/storage/client-fs";

interface DropZoneProps {
  onClose: () => void;
  onComplete: () => void;
  initialFiles?: File[];
}

export default function DropZone({ onClose, onComplete, initialFiles = [] }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [files, setFiles] = useState<File[]>(initialFiles);
  const [fileType, setFileType] = useState<
    "article" | "paper" | "note" | "data"
  >("article");
  const [isIngesting, setIsIngesting] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    created: string[];
    updated: string[];
    logEntry: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mergeUniqueFiles = useCallback((incoming: File[]) => {
    if (incoming.length === 0) return;
    setFiles((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}:${f.size}:${f.lastModified}`));
      const next = [...prev];
      for (const candidate of incoming) {
        const key = `${candidate.name}:${candidate.size}:${candidate.lastModified}`;
        if (!seen.has(key)) {
          seen.add(key);
          next.push(candidate);
        }
      }
      return next;
    });
  }, []);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragIn = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragOut = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    mergeUniqueFiles(Array.from(e.dataTransfer.files || []));
  }, [mergeUniqueFiles]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    mergeUniqueFiles(Array.from(e.target.files || []));
    e.target.value = "";
  };

  const handleIngest = async () => {
    if (files.length === 0) return;
    setIsIngesting(true);
    setError(null);

    try {
      const root = useStorageStore.getState().contentHandle;
      if (!root) throw new Error("Storage not connected");
      let lastRawPath = "";
      for (const file of files) {
        // Use arrayBuffer to preserve binary files (e.g. PDF) exactly as-is
        const buffer = await file.arrayBuffer();
        const rawPath = `raw/${fileType}s/${file.name}`;
        await clientFs.writeFile(root, rawPath, buffer);
        lastRawPath = rawPath;
      }

      setResult({
        success: true,
        created: [],
        updated: [],
        logEntry: `Saved ${files.length} file(s) to raw/${fileType}s (last: ${lastRawPath}).`,
      });
      onComplete();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsIngesting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-[#0d0d14] border border-white/10 rounded-xl w-full max-w-lg mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-white/80">Ingest Source</h2>
          <button
            onClick={onClose}
            className="p-1 rounded text-white/30 hover:text-white/60 hover:bg-white/5"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {!result ? (
          <>
            {/* Drop zone */}
            <div
              onDragEnter={handleDragIn}
              onDragLeave={handleDragOut}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                isDragging
                  ? "border-emerald-400 bg-emerald-500/10"
                  : files.length > 0
                    ? "border-blue-400/50 bg-blue-500/5"
                    : "border-white/10 hover:border-white/20"
              }`}
            >
              {files.length > 0 ? (
                <div className="text-left">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-blue-400">
                      <FileText className="w-5 h-5" />
                      <span className="text-sm">{files.length} file(s) selected</span>
                    </div>
                  <button
                    onClick={() => setFiles([])}
                    className="text-xs text-white/40 hover:text-white/70"
                  >
                      Clear all
                  </button>
                </div>
                  <div className="max-h-32 space-y-1 overflow-y-auto rounded border border-white/10 bg-black/20 p-2">
                    {files.map((f, idx) => (
                      <div key={`${f.name}-${f.size}-${f.lastModified}-${idx}`} className="flex items-center justify-between gap-2 text-xs text-white/70">
                        <span className="truncate">{f.name}</span>
                        <button
                          onClick={() => {
                            setFiles((prev) =>
                              prev.filter((_, i) => i !== idx)
                            );
                          }}
                          className="shrink-0 text-white/35 hover:text-white/70"
                          aria-label={`Remove ${f.name}`}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  <Upload className="w-8 h-8 mx-auto text-white/20 mb-2" />
                  <p className="text-sm text-white/40">
                    Drop a file here or{" "}
                    <label className="text-blue-400 cursor-pointer hover:text-blue-300">
                      browse
                      <input
                        type="file"
                        className="hidden"
                        accept=".md,.txt,.pdf,.json"
                        multiple
                        onChange={handleFileSelect}
                      />
                    </label>
                  </p>
                  <p className="text-xs text-white/20 mt-1">
                    Supports .md, .txt, .pdf, .json
                  </p>
                </div>
              )}
            </div>

            {/* File type selector */}
            <div className="mt-4">
              <label className="text-xs text-white/40 block mb-1">
                Source Type
              </label>
              <div className="flex gap-2">
                {(["article", "paper", "note", "data"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setFileType(t)}
                    className={`px-3 py-1 rounded text-xs ${
                      fileType === t
                        ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                        : "bg-white/5 text-white/40 border border-white/10 hover:border-white/20"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="mt-3 p-2 rounded bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={onClose}
                className="px-4 py-1.5 rounded text-sm text-white/40 hover:text-white/60 hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                onClick={handleIngest}
                disabled={files.length === 0 || isIngesting}
                className="px-4 py-1.5 rounded text-sm bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {isIngesting ? "Processing..." : "Ingest"}
              </button>
            </div>
          </>
        ) : (
          <IngestStatus result={result} onClose={onClose} />
        )}
      </div>
    </div>
  );
}
