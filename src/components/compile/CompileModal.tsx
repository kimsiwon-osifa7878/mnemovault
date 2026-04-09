"use client";

import { useState, useEffect, useRef } from "react";
import { useStorageStore } from "@/stores/storage-store";
import { useLLMStore } from "@/stores/llm-store";
import { getUncompiledFiles } from "@/lib/compile/get-uncompiled";
import { runCompile } from "@/lib/compile/run-compile";
import type { UncompiledFile, CompileProgress, CompileLogEntry } from "@/lib/compile/types";
import {
  X,
  Zap,
  Loader2,
  CheckCircle,
  XCircle,
  FileText,
  Clock,
  ChevronDown,
  ChevronRight,
  ArrowUpRight,
  ArrowDownLeft,
  AlertCircle,
  Info,
  PenLine,
} from "lucide-react";

interface CompileModalProps {
  onClose: () => void;
  onComplete: () => void;
}

type Phase = "loading" | "ready" | "compiling" | "done";

function formatElapsed(ms: number): string {
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  return `${mins}m ${rem}s`;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

const LOG_ICONS: Record<CompileLogEntry["type"], typeof Info> = {
  info: Info,
  request: ArrowUpRight,
  response: ArrowDownLeft,
  error: AlertCircle,
  write: PenLine,
};

const LOG_COLORS: Record<CompileLogEntry["type"], string> = {
  info: "text-white/40",
  request: "text-violet-400",
  response: "text-emerald-400",
  error: "text-red-400",
  write: "text-amber-400",
};

function LogEntryRow({ entry }: { entry: CompileLogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = LOG_ICONS[entry.type];
  const color = LOG_COLORS[entry.type];
  const hasDetail = !!entry.detail;

  return (
    <div className="group">
      <button
        onClick={() => hasDetail && setExpanded(!expanded)}
        className={`flex items-start gap-1.5 w-full text-left py-0.5 ${hasDetail ? "cursor-pointer hover:bg-white/[0.02]" : "cursor-default"}`}
      >
        <Icon className={`w-3 h-3 mt-0.5 shrink-0 ${color}`} />
        <span className="text-[10px] text-white/20 shrink-0 font-mono">{formatTime(entry.timestamp)}</span>
        <span className={`text-[11px] flex-1 ${color}`}>{entry.label}</span>
        {hasDetail && (
          expanded
            ? <ChevronDown className="w-3 h-3 text-white/20 shrink-0 mt-0.5" />
            : <ChevronRight className="w-3 h-3 text-white/20 shrink-0 mt-0.5" />
        )}
      </button>
      {expanded && entry.detail && (
        <pre className="ml-[18px] mt-0.5 mb-1 px-2 py-1.5 rounded bg-black/40 border border-white/5 text-[10px] text-white/50 font-mono overflow-x-auto max-h-48 whitespace-pre-wrap break-all">
          {entry.detail}
        </pre>
      )}
    </div>
  );
}

export default function CompileModal({ onClose, onComplete }: CompileModalProps) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [files, setFiles] = useState<UncompiledFile[]>([]);
  const [progress, setProgress] = useState<CompileProgress | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const contentHandle = useStorageStore((s) => s.contentHandle);
  const getConfig = useLLMStore((s) => s.getConfig);

  useEffect(() => {
    if (!contentHandle) return;
    getUncompiledFiles(contentHandle).then((result) => {
      setFiles(result);
      setPhase("ready");
    });
  }, [contentHandle]);

  useEffect(() => {
    if (phase === "compiling" && progress?.startedAt) {
      timerRef.current = setInterval(() => {
        setElapsed(Date.now() - progress.startedAt);
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase, progress?.startedAt]);

  // Auto-expand the file currently being processed
  useEffect(() => {
    if (progress?.currentFile && phase === "compiling") {
      const currentFile = files.find((f) => f.fileName === progress.currentFile);
      if (currentFile) {
        setExpandedFiles((prev) => {
          const next = new Set(prev);
          next.add(currentFile.path);
          return next;
        });
      }
    }
  }, [progress?.currentFile, phase, files]);

  const handleStartCompile = async () => {
    if (!contentHandle || files.length === 0) return;

    setPhase("compiling");
    const config = getConfig();

    await runCompile(contentHandle, files, config, (p) => {
      setProgress({ ...p });
      if (p.status === "done") {
        setPhase("done");
        if (timerRef.current) clearInterval(timerRef.current);
        onComplete();
      }
    });
  };

  const handleClose = () => {
    if (phase === "compiling") return;
    onClose();
  };

  const toggleFile = (path: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const successCount = progress?.results.filter((r) => !r.error).length ?? 0;
  const failCount = progress?.results.filter((r) => r.error).length ?? 0;
  const totalCreated = progress?.results.reduce((sum, r) => sum + r.createdSlugs.length, 0) ?? 0;
  const totalUpdated = progress?.results.reduce((sum, r) => sum + r.updatedSlugs.length, 0) ?? 0;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-[#0d0d14] border border-white/10 rounded-xl w-full max-w-2xl mx-4 p-6 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-medium text-white/80 flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-400" />
            Compile Wiki
          </h2>
          <button
            onClick={handleClose}
            disabled={phase === "compiling"}
            className="p-1 rounded text-white/30 hover:text-white/60 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Loading Phase */}
        {phase === "loading" && (
          <div className="flex items-center justify-center py-12 text-white/40">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Scanning raw files...
          </div>
        )}

        {/* Ready Phase */}
        {phase === "ready" && (
          <>
            {files.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto mb-3" />
                <p className="text-white/60 text-sm">All files are compiled.</p>
                <p className="text-white/30 text-xs mt-1">
                  Ingest new sources to compile them into wiki pages.
                </p>
                <button
                  onClick={onClose}
                  className="mt-4 px-4 py-1.5 rounded text-sm bg-white/5 text-white/60 hover:bg-white/10"
                >
                  Close
                </button>
              </div>
            ) : (
              <>
                <p className="text-xs text-white/40 mb-3">
                  {files.length} uncompiled file(s) found. LLM will process each file to generate wiki pages.
                </p>
                <div className="flex-1 overflow-y-auto space-y-1 mb-4 max-h-60">
                  {files.map((f) => (
                    <div
                      key={f.path}
                      className="flex items-center gap-2 px-3 py-2 rounded bg-white/[0.03] border border-white/5"
                    >
                      <FileText className="w-3.5 h-3.5 text-amber-400/60 shrink-0" />
                      <span className="text-sm text-white/70 truncate flex-1">{f.fileName}</span>
                      <span className="text-[10px] text-white/30 uppercase shrink-0">{f.fileType}</span>
                      <span className="text-[10px] text-amber-400/60 shrink-0">{f.reason}</span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={handleStartCompile}
                  className="w-full px-4 py-2.5 rounded-lg text-sm font-medium bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors"
                >
                  Start Compile ({files.length} files)
                </button>
              </>
            )}
          </>
        )}

        {/* Compiling / Done Phase */}
        {(phase === "compiling" || phase === "done") && progress && (
          <>
            {/* Progress bar */}
            <div className="mb-4">
              <div className="flex items-center justify-between text-xs text-white/40 mb-1.5">
                <span>{progress.completed} / {progress.total} files</span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatElapsed(phase === "done" ? elapsed : Date.now() - progress.startedAt)}
                </span>
              </div>
              <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full transition-all duration-500"
                  style={{ width: `${progress.total > 0 ? (progress.completed / progress.total) * 100 : 0}%` }}
                />
              </div>
            </div>

            {/* File list with expandable logs */}
            <div ref={listRef} className="flex-1 overflow-y-auto space-y-1 mb-4 min-h-0">
              {files.map((f) => {
                const result = progress.results.find((r) => r.file.path === f.path);
                const isCurrentFile = phase === "compiling" && progress.currentFile === f.fileName && !result;
                const isExpanded = expandedFiles.has(f.path);
                const pageCount = result ? result.createdSlugs.length + result.updatedSlugs.length : 0;
                const logs = result?.logs ?? [];

                return (
                  <div
                    key={f.path}
                    className={`rounded border ${
                      isCurrentFile
                        ? "bg-amber-500/5 border-amber-500/20"
                        : result?.error
                        ? "bg-red-500/5 border-red-500/10"
                        : result
                        ? "bg-white/[0.01] border-white/5"
                        : "bg-white/[0.02] border-white/5"
                    }`}
                  >
                    {/* File header row — clickable to toggle logs */}
                    <button
                      onClick={() => (result || isCurrentFile) && toggleFile(f.path)}
                      className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left ${
                        result || isCurrentFile ? "cursor-pointer" : "cursor-default"
                      }`}
                    >
                      {/* Expand/collapse chevron */}
                      {result || isCurrentFile ? (
                        isExpanded
                          ? <ChevronDown className="w-3 h-3 text-white/20 shrink-0" />
                          : <ChevronRight className="w-3 h-3 text-white/20 shrink-0" />
                      ) : (
                        <div className="w-3 h-3 shrink-0" />
                      )}

                      {/* Status icon */}
                      {result ? (
                        result.error ? (
                          <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                        ) : (
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        )
                      ) : isCurrentFile ? (
                        <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin shrink-0" />
                      ) : (
                        <div className="w-3.5 h-3.5 rounded-full border border-white/10 shrink-0" />
                      )}

                      <span
                        className={`truncate flex-1 ${
                          result?.error ? "text-red-400/70"
                          : result ? "text-white/50"
                          : isCurrentFile ? "text-amber-400"
                          : "text-white/30"
                        }`}
                      >
                        {f.fileName}
                      </span>

                      {result && !result.error && pageCount > 0 && (
                        <span className="text-[10px] text-emerald-400/60 shrink-0">+{pageCount} pages</span>
                      )}
                      {result?.error && (
                        <span className="text-[10px] text-red-400/60 shrink-0 truncate max-w-40">
                          {result.error.length > 60 ? result.error.slice(0, 60) + "..." : result.error}
                        </span>
                      )}
                      {logs.length > 0 && (
                        <span className="text-[10px] text-white/20 shrink-0">{logs.length} logs</span>
                      )}
                    </button>

                    {/* Expanded log entries */}
                    {isExpanded && logs.length > 0 && (
                      <div className="px-3 pb-2 pt-1 border-t border-white/5 space-y-0">
                        {logs.map((entry, i) => (
                          <LogEntryRow key={i} entry={entry} />
                        ))}
                      </div>
                    )}

                    {/* Expanded but no logs yet (currently processing) */}
                    {isExpanded && logs.length === 0 && isCurrentFile && (
                      <div className="px-3 pb-2 pt-1 border-t border-white/5">
                        <div className="flex items-center gap-1.5 text-[10px] text-white/20">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Waiting for logs...
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Done summary */}
            {phase === "done" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="px-3 py-2 rounded bg-emerald-500/10 border border-emerald-500/20">
                    <div className="text-emerald-400 font-medium">{successCount} succeeded</div>
                    <div className="text-emerald-400/50 mt-0.5">
                      {totalCreated} created, {totalUpdated} updated
                    </div>
                  </div>
                  {failCount > 0 && (
                    <div className="px-3 py-2 rounded bg-red-500/10 border border-red-500/20">
                      <div className="text-red-400 font-medium">{failCount} failed</div>
                      <div className="text-red-400/50 mt-0.5">Click to see logs</div>
                    </div>
                  )}
                </div>
                <button
                  onClick={onClose}
                  className="w-full px-4 py-2 rounded text-sm bg-white/5 text-white/60 hover:bg-white/10"
                >
                  Done
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
