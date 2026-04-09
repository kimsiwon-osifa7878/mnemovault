export interface UncompiledFile {
  path: string; // e.g., "raw/articles/my-paper.txt"
  fileName: string; // e.g., "my-paper.txt"
  fileType: string; // e.g., "article"
  reason: "new" | "changed";
}

export interface CompileLogEntry {
  timestamp: number;
  type: "info" | "request" | "response" | "error" | "write";
  label: string;
  detail?: string;
}

export interface CompileFileResult {
  file: UncompiledFile;
  sourceSlug: string;
  createdSlugs: string[];
  updatedSlugs: string[];
  error?: string;
  logs: CompileLogEntry[];
}

export interface CompileProgress {
  total: number;
  completed: number;
  currentFile: string;
  results: CompileFileResult[];
  status: "idle" | "running" | "done" | "error";
  startedAt: number;
}
