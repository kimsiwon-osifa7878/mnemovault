import {
  readFile,
  writeFile,
  readJsonFile,
  listFiles,
} from "@/lib/storage/client-fs";
import { parseWikiPage } from "@/lib/wiki/parser";
import { generateIndexContent } from "@/lib/wiki/index-manager";
import { appendLogEntry } from "@/lib/wiki/log-manager";
import { compileFile } from "./compile-file";
import type {
  CompileFileResult,
  CompileLogEntry,
  CompileProgress,
  CompileSessionEvent,
  UncompiledFile,
} from "./types";
import { normalizeProcessedFilesRecord } from "./processed-files";
import {
  appendCompileSessionEvent,
  buildLogEntryEvent,
  createCompileSessionPaths,
} from "./session-log";

interface LLMConfig {
  provider: "openrouter" | "ollama";
  model: string;
  ollamaUrl?: string;
}

interface RunCompileOptions {
  logEnabled?: boolean;
  signal?: AbortSignal;
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException && error.name === "AbortError"
  ) || (
    error instanceof Error &&
    (error.name === "AbortError" || error.message.toLowerCase().includes("aborted"))
  );
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException("The operation was aborted.", "AbortError");
  }
}

function createStoppedResult(file: UncompiledFile): CompileFileResult {
  return {
    file,
    sourceSlug: "",
    createdSlugs: [],
    updatedSlugs: [],
    status: "stopped",
    errorKind: "aborted",
    logs: [],
  };
}

function createStoppedEvent(file: UncompiledFile): CompileSessionEvent {
  return {
    kind: "file_stopped",
    timestamp: new Date().toISOString(),
    filePath: file.path,
    payload: {
      fileName: file.fileName,
      fileType: file.fileType,
      reason: file.reason,
    },
  };
}

export async function runCompile(
  root: FileSystemDirectoryHandle,
  files: UncompiledFile[],
  llmConfig: LLMConfig,
  onProgress: (progress: CompileProgress) => void,
  language: "en" | "ko" = "en",
  options?: RunCompileOptions
): Promise<CompileFileResult[]> {
  const startedAt = Date.now();
  const logEnabled = options?.logEnabled ?? true;
  const signal = options?.signal;
  const sessionPaths = logEnabled ? createCompileSessionPaths(startedAt) : null;
  const fileStatuses = Object.fromEntries(files.map((file) => [file.path, "queued" as const]));
  const progress: CompileProgress = {
    total: files.length,
    completed: 0,
    currentFile: "",
    currentFilePath: undefined,
    queuedPaths: files.map((file) => file.path),
    fileStatuses,
    results: [],
    activeLogsByFile: {},
    streamTextByFile: {},
    status: "running",
    startedAt,
    sessionLogPath: sessionPaths?.jsonlPath,
  };
  let sessionWriteQueue = Promise.resolve();
  let progressFlushTimer: number | null = null;

  const emitProgress = () => {
    onProgress({
      ...progress,
      results: [...progress.results],
      queuedPaths: [...progress.queuedPaths],
      fileStatuses: { ...progress.fileStatuses },
      activeLogsByFile: Object.fromEntries(
        Object.entries(progress.activeLogsByFile).map(([path, logs]) => [path, [...logs]])
      ),
      streamTextByFile: { ...progress.streamTextByFile },
    });
  };

  const scheduleEmitProgress = () => {
    if (progressFlushTimer) return;
    progressFlushTimer = window.setTimeout(() => {
      progressFlushTimer = null;
      emitProgress();
    }, 50);
  };

  const queueSessionEvent = (event: Parameters<typeof appendCompileSessionEvent>[2]) => {
    if (!sessionPaths) {
      return Promise.resolve();
    }
    const write = sessionWriteQueue.then(() =>
      appendCompileSessionEvent(root, sessionPaths.jsonlPath, event)
    );
    sessionWriteQueue = write.catch(() => undefined);
    return write;
  };

  const markRemainingAsStopped = async (remainingFiles: UncompiledFile[]) => {
    if (remainingFiles.length === 0) return;

    for (const file of remainingFiles) {
      progress.fileStatuses[file.path] = "stopped";
      progress.queuedPaths = progress.queuedPaths.filter((path) => path !== file.path);
      progress.results.push(createStoppedResult(file));
      if (logEnabled) {
        await queueSessionEvent(createStoppedEvent(file));
      }
    }
  };

  if (logEnabled) {
    await queueSessionEvent({
      kind: "session_start",
      timestamp: new Date(progress.startedAt).toISOString(),
      payload: {
        total: files.length,
        model: `${llmConfig.provider}:${llmConfig.model}`,
      },
    });
  }

  emitProgress();

  // Load existing wiki page slugs for merge detection
  const wikiFiles = await listFiles(root, "wiki");
  const existingSlugs = new Set<string>();
  for (const f of wikiFiles) {
    const filename = f.split("/").pop() || f;
    const slug = filename.replace(/\.md$/, "");
    existingSlugs.add(slug);
  }

  // Load processed_files.json
  const processed = normalizeProcessedFilesRecord(
    await readJsonFile(root, "meta/processed_files.json")
  );

  try {
    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      throwIfAborted(signal);

      progress.currentFile = file.fileName;
      progress.currentFilePath = file.path;
      progress.fileStatuses[file.path] = "compiling";
      progress.queuedPaths = progress.queuedPaths.filter((path) => path !== file.path);
      progress.activeLogsByFile[file.path] = [];
      progress.streamTextByFile[file.path] = progress.streamTextByFile[file.path] || "";
      if (logEnabled) {
        await queueSessionEvent({
          kind: "file_start",
          timestamp: new Date().toISOString(),
          filePath: file.path,
          payload: {
            fileName: file.fileName,
            fileType: file.fileType,
            reason: file.reason,
          },
        });
      }
      emitProgress();

      const result = await compileFile(root, file, llmConfig, existingSlugs, language, {
        emitLog: async (entry: CompileLogEntry) => {
          if (!logEnabled) return;
          progress.activeLogsByFile[file.path] = [...(progress.activeLogsByFile[file.path] || []), entry];
          void queueSessionEvent(buildLogEntryEvent(entry));
          scheduleEmitProgress();
        },
        emitStreamChunk: async (filePath: string, chunk: string) => {
          progress.streamTextByFile[filePath] = `${progress.streamTextByFile[filePath] || ""}${chunk}`;
          scheduleEmitProgress();
        },
      }, {
        logEnabled,
        signal,
      });

      if (!logEnabled) {
        result.logs = [];
      }

      progress.results.push(result);
      progress.fileStatuses[file.path] = result.status;

      if (result.status === "success" && result.processedMeta) {
        processed[file.path] = result.processedMeta;
        await writeFile(
          root,
          "meta/processed_files.json",
          JSON.stringify(processed, null, 2)
        );
      }

      if (logEnabled) {
        await queueSessionEvent({
          kind:
            result.status === "stopped"
              ? "file_stopped"
              : result.status === "failed"
                ? "file_error"
                : "file_done",
          timestamp: new Date().toISOString(),
          filePath: file.path,
          payload: {
            error: result.error,
            errorKind: result.errorKind,
            createdSlugs: result.createdSlugs,
            updatedSlugs: result.updatedSlugs,
          },
        });
      }

      progress.completed++;
      emitProgress();

      if (result.status === "stopped") {
        await markRemainingAsStopped(files.slice(index + 1));
        progress.completed += files.length - (index + 1);
        progress.status = "stopped";
        progress.stoppedAt = Date.now();
        break;
      }
    }
  } catch (error) {
    if (isAbortError(error)) {
      if (
        progress.currentFilePath &&
        !progress.results.some((result) => result.file.path === progress.currentFilePath)
      ) {
        const currentFile = files.find((file) => file.path === progress.currentFilePath);
        if (currentFile) {
          progress.fileStatuses[currentFile.path] = "stopped";
          progress.results.push(createStoppedResult(currentFile));
          progress.completed++;
          if (logEnabled) {
            await queueSessionEvent(createStoppedEvent(currentFile));
          }
        }
      }
      const remainingFiles = files.filter(
        (file) => !progress.results.some((result) => result.file.path === file.path) && progress.currentFilePath !== file.path
      );
      await markRemainingAsStopped(remainingFiles);
      progress.completed += remainingFiles.length;
      progress.status = "stopped";
      progress.stoppedAt = Date.now();
    } else {
      progress.status = "error";
      throw error;
    }
  }

  // Regenerate index.md from all wiki pages
  const successfulResults = progress.results.filter((result) => result.status === "success");
  if (successfulResults.length > 0) {
    try {
      const allWikiFiles = await listFiles(root, "wiki");
      const pages = [];
      for (const f of allWikiFiles) {
        const raw = await readFile(root, f);
        const filename = f.split("/").pop() || f;
        pages.push(parseWikiPage(filename, raw));
      }
      const indexContent = generateIndexContent(pages);
      await writeFile(root, "wiki/index.md", indexContent);
    } catch {
      // Non-fatal: index regeneration failure
    }
  }

  // Append to log.md
  if (logEnabled && successfulResults.length > 0) {
    try {
      const logContent = await readFile(root, "wiki/log.md");
      const successResults = successfulResults;
      const failedResults = progress.results.filter((r) => r.status === "failed");
      const stoppedResults = progress.results.filter((r) => r.status === "stopped");

      const details: string[] = [];
      for (const r of successResults) {
        if (r.createdSlugs.length > 0) {
          details.push(`Created: ${r.createdSlugs.map((s) => `[[${s}]]`).join(", ")}`);
        }
        if (r.updatedSlugs.length > 0) {
          details.push(`Updated: ${r.updatedSlugs.map((s) => `[[${s}]]`).join(", ")}`);
        }
      }
      if (failedResults.length > 0) {
        details.push(`Failed: ${failedResults.map((r) => r.file.fileName).join(", ")}`);
      }
      if (stoppedResults.length > 0) {
        details.push(`Stopped: ${stoppedResults.map((r) => r.file.fileName).join(", ")}`);
      }
      if (sessionPaths?.jsonlPath) {
        details.push(`Session log: ${sessionPaths.jsonlPath}`);
      }
      details.push(`Index updated`);

      const summary = `${files.length} file(s) compiled`;
      const updatedLog = appendLogEntry(logContent, "compile", summary, details);
      await writeFile(root, "wiki/log.md", updatedLog);
    } catch {
      // Non-fatal
    }
  }
  if (logEnabled) {
    await queueSessionEvent({
      kind: progress.status === "stopped" ? "session_stopped" : "session_done",
      timestamp: new Date().toISOString(),
      payload: {
        completed: progress.completed,
        succeeded: progress.results.filter((result) => result.status === "success").length,
        failed: progress.results.filter((result) => result.status === "failed").length,
        stopped: progress.results.filter((result) => result.status === "stopped").length,
        sessionLogPath: sessionPaths?.jsonlPath,
      },
    });
  }
  await sessionWriteQueue;

  if (progress.status === "running") {
    progress.status = "done";
  }
  progress.currentFile = "";
  progress.currentFilePath = undefined;
  if (progressFlushTimer) {
    clearTimeout(progressFlushTimer);
    progressFlushTimer = null;
  }
  emitProgress();

  return progress.results;
}
