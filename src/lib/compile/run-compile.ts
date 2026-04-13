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
  UncompiledFile,
  CompileFileResult,
  CompileLogEntry,
  CompileProgress,
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

export async function runCompile(
  root: FileSystemDirectoryHandle,
  files: UncompiledFile[],
  llmConfig: LLMConfig,
  onProgress: (progress: CompileProgress) => void,
  language: "en" | "ko" = "en"
): Promise<CompileFileResult[]> {
  const startedAt = Date.now();
  const sessionPaths = createCompileSessionPaths(startedAt);
  const progress: CompileProgress = {
    total: files.length,
    completed: 0,
    currentFile: "",
    results: [],
    activeLogsByFile: {},
    status: "running",
    startedAt,
    sessionLogPath: sessionPaths.jsonlPath,
  };

  const emitProgress = () => {
    onProgress({
      ...progress,
      results: [...progress.results],
      activeLogsByFile: Object.fromEntries(
        Object.entries(progress.activeLogsByFile).map(([path, logs]) => [path, [...logs]])
      ),
    });
  };

  await appendCompileSessionEvent(root, sessionPaths.jsonlPath, {
    kind: "session_start",
    timestamp: new Date(progress.startedAt).toISOString(),
    payload: {
      total: files.length,
      model: `${llmConfig.provider}:${llmConfig.model}`,
    },
  });

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

  for (const file of files) {
    progress.currentFile = file.fileName;
    progress.activeLogsByFile[file.path] = [];
    await appendCompileSessionEvent(root, sessionPaths.jsonlPath, {
      kind: "file_start",
      timestamp: new Date().toISOString(),
      filePath: file.path,
      payload: {
        fileName: file.fileName,
        fileType: file.fileType,
        reason: file.reason,
      },
    });
    emitProgress();

    const result = await compileFile(root, file, llmConfig, existingSlugs, language, {
      emitLog: async (entry: CompileLogEntry) => {
        progress.activeLogsByFile[file.path] = [...(progress.activeLogsByFile[file.path] || []), entry];
        await appendCompileSessionEvent(
          root,
          sessionPaths.jsonlPath,
          buildLogEntryEvent(entry)
        );
        emitProgress();
      },
    });
    progress.results.push(result);

    // Update processed_files.json immediately per file
    if (!result.error && result.processedMeta) {
      processed[file.path] = result.processedMeta;
      await writeFile(
        root,
        "meta/processed_files.json",
        JSON.stringify(processed, null, 2)
      );
    }

    await appendCompileSessionEvent(root, sessionPaths.jsonlPath, {
      kind: result.error ? "file_error" : "file_done",
      timestamp: new Date().toISOString(),
      filePath: file.path,
      payload: {
        error: result.error,
        createdSlugs: result.createdSlugs,
        updatedSlugs: result.updatedSlugs,
      },
    });
    progress.completed++;
    emitProgress();
  }

  // Regenerate index.md from all wiki pages
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

  // Append to log.md
  try {
    const logContent = await readFile(root, "wiki/log.md");
    const successResults = progress.results.filter((r) => !r.error);
    const failedResults = progress.results.filter((r) => r.error);

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
    details.push(`Session log: ${sessionPaths.jsonlPath}`);
    details.push(`Index updated`);

    const summary = `${files.length} file(s) compiled`;
    const updatedLog = appendLogEntry(logContent, "compile", summary, details);
    await writeFile(root, "wiki/log.md", updatedLog);
  } catch {
    // Non-fatal
  }
  await appendCompileSessionEvent(root, sessionPaths.jsonlPath, {
    kind: "session_done",
    timestamp: new Date().toISOString(),
    payload: {
      completed: progress.completed,
      succeeded: progress.results.filter((result) => !result.error).length,
      failed: progress.results.filter((result) => !!result.error).length,
      sessionLogPath: sessionPaths.jsonlPath,
    },
  });

  progress.status = "done";
  progress.currentFile = "";
  emitProgress();

  return progress.results;
}
