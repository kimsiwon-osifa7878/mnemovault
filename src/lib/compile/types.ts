export interface UncompiledFile {
  path: string; // e.g., "raw/articles/my-paper.txt"
  fileName: string; // e.g., "my-paper.txt"
  fileType: string; // e.g., "article"
  reason: "new" | "content_changed" | "pipeline_changed";
}

export type CompileLogScope = "session" | "file" | "llm_stream";
export type CompileFileStatus = "idle" | "queued" | "compiling" | "success" | "failed" | "stopped";
export type CompileSessionStatus = "idle" | "running" | "stopped" | "done" | "error";
export type CompileErrorKind = "error" | "aborted";

export interface CompileLogEntry {
  timestamp: number;
  type: "info" | "request" | "response" | "error" | "write";
  scope: CompileLogScope;
  label: string;
  filePath?: string;
  stage?: string;
  detail?: string;
}

export interface CompileFileResult {
  file: UncompiledFile;
  sourceSlug: string;
  createdSlugs: string[];
  updatedSlugs: string[];
  status: CompileFileStatus;
  errorKind?: CompileErrorKind;
  processedMeta?: ProcessedFileMeta;
  error?: string;
  logs: CompileLogEntry[];
}

export interface CompileProgress {
  total: number;
  completed: number;
  currentFile: string;
  currentFilePath?: string;
  queuedPaths: string[];
  fileStatuses: Record<string, CompileFileStatus>;
  results: CompileFileResult[];
  activeLogsByFile: Record<string, CompileLogEntry[]>;
  streamTextByFile: Record<string, string>;
  status: CompileSessionStatus;
  startedAt: number;
  stoppedAt?: number;
  sessionLogPath?: string;
}

export interface ProcessedFileMeta {
  path: string;
  sha256: string;
  compiled_at: string;
  pipeline_version: string;
}

export interface CompileSessionEvent {
  kind:
    | "session_start"
    | "session_done"
    | "session_stopped"
    | "file_start"
    | "file_done"
    | "file_error"
    | "file_stopped"
    | "log"
    | "llm_chunk";
  timestamp: string;
  filePath?: string;
  payload: Record<string, unknown>;
}
