import { readFile, writeFile, fileExists } from "@/lib/storage/client-fs";
import { toSlug } from "@/lib/utils/markdown";
import type { UncompiledFile, CompileFileResult, CompileLogEntry } from "./types";
import type { IngestLLMResult } from "@/lib/llm/ingest";

interface LLMConfig {
  provider: "openrouter" | "ollama";
  model: string;
  ollamaUrl?: string;
}

const today = () => new Date().toISOString().split("T")[0];

function buildFrontmatter(fields: Record<string, unknown>): string {
  const lines = ["---"];
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) {
      lines.push(`${key}: [${value.map((v) => `"${v}"`).join(", ")}]`);
    } else {
      lines.push(`${key}: "${value}"`);
    }
  }
  lines.push("---");
  return lines.join("\n");
}

function buildSourcePage(
  result: IngestLLMResult,
  rawFileName: string
): string {
  const fm = buildFrontmatter({
    title: result.summary.title || rawFileName,
    type: "source",
    created: today(),
    updated: today(),
    sources: [rawFileName],
    tags: result.tags,
    confidence: "medium",
  });

  const takeaways = result.summary.key_takeaways
    .map((t) => `- ${t}`)
    .join("\n");

  return `${fm}

# ${result.summary.title || rawFileName}

${result.summary.content}

## Key Takeaways

${takeaways || "_No key takeaways extracted._"}
`;
}

function buildNewConceptOrEntityPage(
  name: string,
  content: string,
  type: "concept" | "entity",
  rawFileName: string,
  tags: string[]
): string {
  const fm = buildFrontmatter({
    title: name,
    type,
    created: today(),
    updated: today(),
    sources: [rawFileName],
    tags,
    confidence: "medium",
  });

  return `${fm}

# ${name}

${content}
`;
}

function mergeIntoExistingPage(
  existingRawContent: string,
  newContent: string,
  rawFileName: string
): string {
  // Update the "updated" date in frontmatter
  const updatedContent = existingRawContent.replace(
    /updated: "[\d-]+"/,
    `updated: "${today()}"`
  );

  // Append new section at the end
  return `${updatedContent.trimEnd()}

## From: ${rawFileName}

${newContent}
`;
}

function log(logs: CompileLogEntry[], type: CompileLogEntry["type"], label: string, detail?: string) {
  logs.push({ timestamp: Date.now(), type, label, detail });
}

export async function compileFile(
  root: FileSystemDirectoryHandle,
  file: UncompiledFile,
  llmConfig: LLMConfig,
  existingSlugs: Set<string>,
  language: "en" | "ko" = "en"
): Promise<CompileFileResult> {
  const logs: CompileLogEntry[] = [];
  const result: CompileFileResult = {
    file,
    sourceSlug: "",
    createdSlugs: [],
    updatedSlugs: [],
    logs,
  };

  try {
    // 1. Read raw file
    log(logs, "info", "Reading raw file", file.path);
    const content = await readFile(root, file.path);
    log(logs, "info", "File read OK", `${content.length} chars`);

    // 2. Call LLM via API route
    const requestBody = {
      fileName: file.fileName,
      content,
      fileType: file.fileType,
      llmConfig,
      language,
    };
    log(logs, "request", `POST /api/llm/ingest`, JSON.stringify({
      fileName: file.fileName,
      fileType: file.fileType,
      contentLength: content.length,
      llmConfig,
    }, null, 2));

    const res = await fetch("/api/llm/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    const responseText = await res.text();

    if (!res.ok) {
      log(logs, "error", `API ${res.status} ${res.statusText}`, responseText);
      throw new Error(`API error ${res.status}: ${responseText}`);
    }

    let llmResult: IngestLLMResult;
    try {
      llmResult = JSON.parse(responseText);
    } catch {
      log(logs, "error", "JSON parse failed", responseText.slice(0, 500));
      throw new Error(`Invalid JSON response from API`);
    }

    log(logs, "response", "LLM response OK", JSON.stringify({
      summaryTitle: llmResult.summary?.title,
      conceptCount: llmResult.concepts?.length ?? 0,
      entityCount: llmResult.entities?.length ?? 0,
      tagCount: llmResult.tags?.length ?? 0,
    }, null, 2));

    // 3. Create source summary page
    const sourceSlug = toSlug(llmResult.summary.title || file.fileName.replace(/\.[^.]+$/, ""));
    result.sourceSlug = sourceSlug;
    const sourcePath = `wiki/sources/${sourceSlug}.md`;
    const sourceContent = buildSourcePage(llmResult, file.fileName);
    await writeFile(root, sourcePath, sourceContent);
    result.createdSlugs.push(sourceSlug);
    log(logs, "write", "Created source page", sourcePath);

    // 4. Create/merge concept pages
    for (const concept of llmResult.concepts) {
      const slug = toSlug(concept.name);
      const pagePath = `wiki/concepts/${slug}.md`;

      if (existingSlugs.has(slug) || await fileExists(root, pagePath)) {
        try {
          const existing = await readFile(root, pagePath);
          const merged = mergeIntoExistingPage(existing, concept.content, file.fileName);
          await writeFile(root, pagePath, merged);
          result.updatedSlugs.push(slug);
          log(logs, "write", `Merged concept: ${concept.name}`, pagePath);
        } catch {
          const page = buildNewConceptOrEntityPage(concept.name, concept.content, "concept", file.fileName, llmResult.tags);
          await writeFile(root, pagePath, page);
          result.createdSlugs.push(slug);
          log(logs, "write", `Created concept: ${concept.name}`, pagePath);
        }
      } else {
        const page = buildNewConceptOrEntityPage(concept.name, concept.content, "concept", file.fileName, llmResult.tags);
        await writeFile(root, pagePath, page);
        result.createdSlugs.push(slug);
        existingSlugs.add(slug);
        log(logs, "write", `Created concept: ${concept.name}`, pagePath);
      }
    }

    // 5. Create/merge entity pages
    for (const entity of llmResult.entities) {
      const slug = toSlug(entity.name);
      const pagePath = `wiki/entities/${slug}.md`;

      if (existingSlugs.has(slug) || await fileExists(root, pagePath)) {
        try {
          const existing = await readFile(root, pagePath);
          const merged = mergeIntoExistingPage(existing, entity.content, file.fileName);
          await writeFile(root, pagePath, merged);
          result.updatedSlugs.push(slug);
          log(logs, "write", `Merged entity: ${entity.name}`, pagePath);
        } catch {
          const page = buildNewConceptOrEntityPage(entity.name, entity.content, "entity", file.fileName, llmResult.tags);
          await writeFile(root, pagePath, page);
          result.createdSlugs.push(slug);
          log(logs, "write", `Created entity: ${entity.name}`, pagePath);
        }
      } else {
        const page = buildNewConceptOrEntityPage(entity.name, entity.content, "entity", file.fileName, llmResult.tags);
        await writeFile(root, pagePath, page);
        result.createdSlugs.push(slug);
        existingSlugs.add(slug);
        log(logs, "write", `Created entity: ${entity.name}`, pagePath);
      }
    }

    log(logs, "info", "Compile complete", `${result.createdSlugs.length} created, ${result.updatedSlugs.length} updated`);
  } catch (e) {
    result.error = (e as Error).message;
    if (!logs.some((l) => l.type === "error")) {
      log(logs, "error", "Unexpected error", (e as Error).message);
    }
  }

  return result;
}
