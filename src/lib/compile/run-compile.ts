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
import type { UncompiledFile, CompileFileResult, CompileProgress } from "./types";

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
  const progress: CompileProgress = {
    total: files.length,
    completed: 0,
    currentFile: "",
    results: [],
    status: "running",
    startedAt: Date.now(),
  };

  onProgress({ ...progress });

  // Load existing wiki page slugs for merge detection
  const wikiFiles = await listFiles(root, "wiki");
  const existingSlugs = new Set<string>();
  for (const f of wikiFiles) {
    const filename = f.split("/").pop() || f;
    const slug = filename.replace(/\.md$/, "");
    existingSlugs.add(slug);
  }

  // Load processed_files.json
  const processed = await readJsonFile(root, "meta/processed_files.json");

  for (const file of files) {
    progress.currentFile = file.fileName;
    onProgress({ ...progress });

    const result = await compileFile(root, file, llmConfig, existingSlugs, language);
    progress.results.push(result);

    // Update processed_files.json immediately per file
    if (!result.error) {
      processed[file.path] = new Date().toISOString();
      await writeFile(
        root,
        "meta/processed_files.json",
        JSON.stringify(processed, null, 2)
      );
    }

    progress.completed++;
    onProgress({ ...progress });
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
    details.push(`Index updated`);

    const summary = `${files.length} file(s) compiled`;
    const updatedLog = appendLogEntry(logContent, "compile", summary, details);
    await writeFile(root, "wiki/log.md", updatedLog);
  } catch {
    // Non-fatal
  }

  progress.status = "done";
  progress.currentFile = "";
  onProgress({ ...progress });

  return progress.results;
}
