"use client";

import { useEffect, useRef, useState } from "react";
import { getUncompiledFiles } from "@/lib/compile/get-uncompiled";
import { runCompile } from "@/lib/compile/run-compile";
import type {
  CompileFileResult,
  CompileFileStatus,
  CompileLogEntry,
  CompileProgress,
  UncompiledFile,
} from "@/lib/compile/types";
import { useLLMStore } from "@/stores/llm-store";
import { useStorageStore } from "@/stores/storage-store";
import { useWikiStore } from "@/stores/wiki-store";
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  FileText,
  Info,
  Loader2,
  PenLine,
  Square,
  X,
  XCircle,
} from "lucide-react";

interface CompileModalProps {
  onClose: () => void;
  onComplete: () => void;
}

interface FileJobState {
  status: CompileFileStatus;
  result?: CompileFileResult;
  logs: CompileLogEntry[];
  streamText: string;
}

function formatCompileReason(reason: UncompiledFile["reason"]): string {
  switch (reason) {
    case "new":
      return "new";
    case "content_changed":
      return "content changed";
    case "pipeline_changed":
      return "pipeline changed";
  }
}

function formatElapsed(ms: number): string {
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  return `${mins}m ${rem}s`;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function createInitialJobStates(files: UncompiledFile[]): Record<string, FileJobState> {
  return Object.fromEntries(
    files.map((file) => [
      file.path,
      {
        status: "idle" as const,
        logs: [],
        streamText: "",
      },
    ])
  );
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
          expanded ? (
            <ChevronDown className="w-3 h-3 text-white/20 shrink-0 mt-0.5" />
          ) : (
            <ChevronRight className="w-3 h-3 text-white/20 shrink-0 mt-0.5" />
          )
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

function StreamTextPanel({ content, isLive }: { content: string; isLive: boolean }) {
  return (
    <div className="px-3 pt-2 pb-2 border-t border-white/5">
      <div className="text-[10px] uppercase tracking-wider text-white/35 mb-2">
        {isLive ? "LLM Response (live)" : "LLM Response (partial)"}
      </div>
      <pre className="rounded bg-black/40 border border-white/5 px-3 py-2 text-[11px] text-white/70 whitespace-pre-wrap break-words overflow-x-auto max-h-64">
        {content}
      </pre>
    </div>
  );
}

function renderStatusIcon(status: CompileFileStatus) {
  switch (status) {
    case "queued":
      return <Clock className="w-3.5 h-3.5 text-white/35 shrink-0" />;
    case "compiling":
      return <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin shrink-0" />;
    case "success":
      return <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
    case "failed":
      return <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />;
    case "stopped":
      return <Square className="w-3.5 h-3.5 text-white/45 shrink-0" />;
    default:
      return <div className="w-3.5 h-3.5 rounded-full border border-white/10 shrink-0" />;
  }
}

function getRowClasses(status: CompileFileStatus): string {
  switch (status) {
    case "compiling":
      return "bg-amber-500/5 border-amber-500/20";
    case "success":
      return "bg-emerald-500/5 border-emerald-500/10";
    case "failed":
      return "bg-red-500/5 border-red-500/10";
    case "stopped":
      return "bg-white/[0.03] border-white/10";
    case "queued":
      return "bg-white/[0.04] border-white/10";
    default:
      return "bg-white/[0.02] border-white/5";
  }
}

export default function CompileModal({ onClose, onComplete }: CompileModalProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [files, setFiles] = useState<UncompiledFile[]>([]);
  const [jobStates, setJobStates] = useState<Record<string, FileJobState>>({});
  const [progress, setProgress] = useState<CompileProgress | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [isRunning, setIsRunning] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const runControllerRef = useRef<AbortController | null>(null);
  const jobStatesRef = useRef<Record<string, FileJobState>>({});
  const activeRunIdRef = useRef(0);

  const contentHandle = useStorageStore((s) => s.contentHandle);
  const getConfig = useLLMStore((s) => s.getConfig);
  const language = useLLMStore((s) => s.language);
  const compileLogsEnabled = useLLMStore((s) => s.compileLogsEnabled);
  const openFile = useWikiStore((s) => s.openFile);

  const activeCount = files.filter((file) => jobStates[file.path]?.status !== "idle").length;
  const queuedCount = files.filter((file) => jobStates[file.path]?.status === "queued").length;
  const compilingCount = files.filter((file) => jobStates[file.path]?.status === "compiling").length;
  const successCount = files.filter((file) => jobStates[file.path]?.status === "success").length;
  const failCount = files.filter((file) => jobStates[file.path]?.status === "failed").length;
  const stoppedCount = files.filter((file) => jobStates[file.path]?.status === "stopped").length;
  const completedCount = successCount + failCount + stoppedCount;
  const totalCreated = files.reduce((sum, file) => sum + (jobStates[file.path]?.result?.createdSlugs.length ?? 0), 0);
  const totalUpdated = files.reduce((sum, file) => sum + (jobStates[file.path]?.result?.updatedSlugs.length ?? 0), 0);
  const canCompileAll = files.some((file) => {
    const status = jobStates[file.path]?.status ?? "idle";
    return status === "idle" || status === "failed" || status === "stopped";
  });
  const latestSessionLogPath = progress?.sessionLogPath;
  const hasActiveWork = compilingCount > 0 || queuedCount > 0;

  useEffect(() => {
    jobStatesRef.current = jobStates;
  }, [jobStates]);

  useEffect(() => {
    if (!contentHandle) return;

    let cancelled = false;

    void getUncompiledFiles(contentHandle).then((result) => {
      if (cancelled) return;
      const nextStates = createInitialJobStates(result);
      setFiles(result);
      setJobStates(nextStates);
      jobStatesRef.current = nextStates;
      setProgress(null);
      setElapsed(0);
      setIsRunning(false);
      setIsStopping(false);
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [contentHandle]);

  useEffect(() => {
    if (progress?.startedAt && (isRunning || isStopping)) {
      timerRef.current = setInterval(() => {
        setElapsed(Date.now() - progress.startedAt);
      }, 1000);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isRunning, isStopping, progress?.startedAt]);

  useEffect(() => {
    if (!listRef.current || (!isRunning && !isStopping)) return;
    const node = listRef.current;
    const nearBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 80;
    if (nearBottom) {
      node.scrollTop = node.scrollHeight;
    }
  }, [isRunning, isStopping, jobStates, progress]);

  const applyProgress = (runId: number, queuedFiles: UncompiledFile[], nextProgress: CompileProgress) => {
    if (activeRunIdRef.current !== runId) return;
    setProgress({ ...nextProgress });
    if (nextProgress.currentFilePath) {
      setExpandedFiles((prev) => {
        if (prev.has(nextProgress.currentFilePath!)) return prev;
        const next = new Set(prev);
        next.add(nextProgress.currentFilePath!);
        return next;
      });
    }
    setJobStates((prev) => {
      const next = { ...prev };
      for (const file of queuedFiles) {
        const previous = next[file.path] ?? { status: "idle" as const, logs: [], streamText: "" };
        next[file.path] = {
          ...previous,
          status: nextProgress.fileStatuses[file.path] ?? previous.status,
          logs: nextProgress.activeLogsByFile[file.path] ?? previous.logs,
          streamText: nextProgress.streamTextByFile[file.path] ?? previous.streamText,
        };
      }
      for (const result of nextProgress.results) {
        const previous = next[result.file.path] ?? { status: "idle" as const, logs: [], streamText: "" };
        next[result.file.path] = {
          ...previous,
          status: result.status,
          result,
          logs: result.logs.length > 0 ? result.logs : previous.logs,
          streamText: nextProgress.streamTextByFile[result.file.path] ?? previous.streamText,
        };
      }
      jobStatesRef.current = next;
      return next;
    });
  };

  const startQueuedRun = (queuedFiles: UncompiledFile[]) => {
    if (!contentHandle || queuedFiles.length === 0 || isRunning || isStopping) return;

    const runId = activeRunIdRef.current + 1;
    activeRunIdRef.current = runId;
    const controller = new AbortController();
    runControllerRef.current = controller;
    setIsRunning(true);

    const config = getConfig();
    const successBefore = files.filter((file) => jobStatesRef.current[file.path]?.status === "success").length;

    void runCompile(
      contentHandle,
      queuedFiles,
      config,
      (nextProgress) => applyProgress(runId, queuedFiles, nextProgress),
      language,
      {
        logEnabled: compileLogsEnabled,
        signal: controller.signal,
      }
    )
      .catch(() => undefined)
      .finally(() => {
        if (activeRunIdRef.current !== runId) {
          return;
        }
        activeRunIdRef.current = 0;
        runControllerRef.current = null;
        setIsRunning(false);
        setIsStopping(false);
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        const successAfter = files.filter((file) => jobStatesRef.current[file.path]?.status === "success").length;
        if (successAfter > successBefore) {
          onComplete();
        }
        const remainingQueued = files.filter((file) => jobStatesRef.current[file.path]?.status === "queued");
        if (remainingQueued.length > 0) {
          window.setTimeout(() => {
            startQueuedRun(remainingQueued);
          }, 0);
        }
      });
  };


  const enqueueFiles = (targets: UncompiledFile[]) => {
    if (targets.length === 0 || isStopping) return;

    let queuedAfterUpdate: UncompiledFile[] = [];

    setJobStates((prev) => {
      const next = { ...prev };
      for (const file of targets) {
        const current = prev[file.path] ?? { status: "idle" as const, logs: [], streamText: "" };
        if (current.status === "queued" || current.status === "compiling" || current.status === "success") {
          continue;
        }
        next[file.path] = {
          ...current,
          status: "queued",
          result: undefined,
          logs: [],
          streamText: "",
        };
      }
      jobStatesRef.current = next;
      queuedAfterUpdate = files.filter((file) => next[file.path]?.status === "queued");
      return next;
    });

    if (!isRunning) {
      window.setTimeout(() => {
        startQueuedRun(queuedAfterUpdate);
      }, 0);
    }
  };

  const handleCompileAll = () => {
    enqueueFiles(
      files.filter((file) => {
        const status = jobStates[file.path]?.status ?? "idle";
        return status === "idle" || status === "failed" || status === "stopped";
      })
    );
  };

  const handleStop = () => {
    if (!isRunning || isStopping) return;
    setIsStopping(true);
    runControllerRef.current?.abort();
  };

  const handleClose = () => {
    if (hasActiveWork) return;
    onClose();
  };

  const handleOpenLogs = async () => {
    if (!latestSessionLogPath) return;
    await openFile(latestSessionLogPath);
    onClose();
  };

  const toggleFile = (path: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
        <div className="bg-[#0d0d14] border border-white/10 rounded-xl w-full max-w-2xl mx-4 p-6">
          <div className="flex items-center justify-center py-12 text-white/40">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Scanning raw files...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-[#0d0d14] border border-white/10 rounded-xl w-full max-w-3xl mx-4 p-6 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between mb-5 gap-3">
          <div>
            <h2 className="text-lg font-medium text-white/80 flex items-center gap-2">
              <FileText className="w-5 h-5 text-amber-400" />
              Compile Wiki
            </h2>
            <p className="text-xs text-white/35 mt-1">
              {files.length === 0
                ? "All files are compiled."
                : `${files.length} uncompiled file(s) loaded. Queue individual files or compile them all.`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isRunning || isStopping ? (
              <button
                onClick={handleStop}
                disabled={isStopping}
                className="px-3 py-1.5 rounded-md text-xs font-medium bg-red-500/15 text-red-300 hover:bg-red-500/25 disabled:opacity-50"
              >
                {isStopping ? "Stopping..." : "Stop"}
              </button>
            ) : (
              <button
                onClick={handleCompileAll}
                disabled={!canCompileAll}
                className="px-3 py-1.5 rounded-md text-xs font-medium bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 disabled:opacity-40"
              >
                Compile All
              </button>
            )}
            <button
              onClick={handleClose}
              disabled={hasActiveWork}
              className="p-1 rounded text-white/30 hover:text-white/60 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {files.length === 0 ? (
          <div className="text-center py-12">
            <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto mb-3" />
            <p className="text-white/60 text-sm">Nothing to compile right now.</p>
            <button
              onClick={onClose}
              className="mt-4 px-4 py-1.5 rounded text-sm bg-white/5 text-white/60 hover:bg-white/10"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            <div className="mb-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-white/40 mb-2">
                <div className="flex items-center gap-3">
                  <span>{activeCount} in session</span>
                  <span>{queuedCount} queued</span>
                  <span>{compilingCount} compiling</span>
                  <span>{completedCount} finished</span>
                </div>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatElapsed(elapsed)}
                </span>
              </div>
              <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full transition-all duration-500"
                  style={{ width: `${activeCount > 0 ? (completedCount / activeCount) * 100 : 0}%` }}
                />
              </div>
            </div>

            <div ref={listRef} className="flex-1 overflow-y-auto space-y-1 mb-4 min-h-0">
              {files.map((file) => {
                const job = jobStates[file.path] ?? { status: "idle" as const, logs: [], streamText: "" };
                const isExpanded = expandedFiles.has(file.path);
                const shouldAllowExpand = job.status !== "idle";
                const logs = job.logs.filter((entry) => entry.scope !== "llm_stream");
                const hasStreamText = job.streamText.trim().length > 0;
                const pageCount = (job.result?.createdSlugs.length ?? 0) + (job.result?.updatedSlugs.length ?? 0);
                const buttonLabel =
                  job.status === "failed" || job.status === "stopped"
                    ? "Retry"
                    : job.status === "queued"
                      ? "Queued"
                      : job.status === "compiling"
                        ? "Compiling"
                        : job.status === "success"
                          ? "Compiled"
                          : "Compile";
                const buttonDisabled =
                  isStopping ||
                  job.status === "queued" ||
                  job.status === "compiling" ||
                  job.status === "success";

                return (
                  <div key={file.path} className={`rounded border ${getRowClasses(job.status)}`}>
                    <div className="flex items-center gap-2 px-3 py-2">
                      <button
                        onClick={() => shouldAllowExpand && toggleFile(file.path)}
                        className={`shrink-0 ${shouldAllowExpand ? "cursor-pointer" : "cursor-default"}`}
                      >
                        {shouldAllowExpand ? (
                          isExpanded ? (
                            <ChevronDown className="w-3 h-3 text-white/20" />
                          ) : (
                            <ChevronRight className="w-3 h-3 text-white/20" />
                          )
                        ) : (
                          <div className="w-3 h-3" />
                        )}
                      </button>
                      {renderStatusIcon(job.status)}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-white/75 truncate">{file.fileName}</div>
                        <div className="flex items-center gap-2 text-[10px] text-white/30 uppercase mt-0.5">
                          <span>{file.fileType}</span>
                          <span>{formatCompileReason(file.reason)}</span>
                          <span>{job.status}</span>
                        </div>
                      </div>
                      {job.result?.error && (
                        <span className="text-[10px] text-red-300/70 truncate max-w-48">
                          {job.result.error.length > 60 ? `${job.result.error.slice(0, 60)}...` : job.result.error}
                        </span>
                      )}
                      {!job.result?.error && pageCount > 0 && (
                        <span className="text-[10px] text-emerald-300/70 shrink-0">
                          +{pageCount} pages
                        </span>
                      )}
                      <button
                        onClick={() => enqueueFiles([file])}
                        disabled={buttonDisabled}
                        className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-white/5 text-white/65 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {buttonLabel}
                      </button>
                    </div>

                    {isExpanded && hasStreamText && (
                      <StreamTextPanel content={job.streamText} isLive={job.status === "compiling"} />
                    )}

                    {isExpanded && compileLogsEnabled && logs.length > 0 && (
                      <div className={`${hasStreamText ? "px-3 pb-2 pt-1" : "px-3 pb-2 pt-1 border-t border-white/5"} space-y-0`}>
                        {logs.map((entry, index) => (
                          <LogEntryRow key={`${entry.timestamp}-${index}`} entry={entry} />
                        ))}
                      </div>
                    )}

                    {isExpanded && !hasStreamText && job.status === "compiling" && (
                      <div className="px-3 pb-2 pt-1 border-t border-white/5">
                        <div className="flex items-center gap-1.5 text-[10px] text-white/20">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          {compileLogsEnabled ? "Waiting for logs..." : "Waiting for response..."}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="px-3 py-2 rounded bg-emerald-500/10 border border-emerald-500/20">
                  <div className="text-emerald-400 font-medium">{successCount} succeeded</div>
                  <div className="text-emerald-400/50 mt-0.5">
                    {totalCreated} created, {totalUpdated} updated
                  </div>
                </div>
                <div className="px-3 py-2 rounded bg-red-500/10 border border-red-500/20">
                  <div className="text-red-400 font-medium">{failCount} failed</div>
                  <div className="text-red-400/50 mt-0.5">Retryable in place</div>
                </div>
                <div className="px-3 py-2 rounded bg-white/[0.04] border border-white/10">
                  <div className="text-white/70 font-medium">{stoppedCount} stopped</div>
                  <div className="text-white/35 mt-0.5">Queue paused by user</div>
                </div>
              </div>

              {compileLogsEnabled && latestSessionLogPath && (
                <button
                  type="button"
                  onClick={() => void handleOpenLogs()}
                  className="w-full px-4 py-2 rounded text-sm bg-white/5 text-white/70 hover:bg-white/10 inline-flex items-center justify-center gap-2"
                >
                  <ExternalLink className="w-4 h-4" />
                  Open Session Logs
                </button>
              )}

              {!isRunning && !isStopping && (
                <button
                  onClick={handleCompileAll}
                  disabled={!canCompileAll}
                  className="w-full px-4 py-2.5 rounded-lg text-sm font-medium bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors disabled:opacity-40"
                >
                  Compile All
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
