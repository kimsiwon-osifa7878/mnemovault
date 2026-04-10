import { readFile, readFileAsBuffer, writeFile, fileExists, listFiles } from "@/lib/storage/client-fs";
import { extractTextFromPdf } from "@/lib/utils/pdf";
import { toSlug } from "@/lib/utils/markdown";
import type { UncompiledFile, CompileFileResult, CompileLogEntry } from "./types";
import type { IngestLLMResult } from "@/lib/llm/ingest";
import { parseWikiPage } from "@/lib/wiki/parser";

interface LLMConfig {
  provider: "openrouter" | "ollama";
  model: string;
  ollamaUrl?: string;
}

const today = () => new Date().toISOString().split("T")[0];
const WIKI_CONTEXT_PAGE_LIMIT = 24;
const WIKI_CONTEXT_SNIPPET_LIMIT = 360;

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
  const updatedPages = result.updates_to_existing_pages
    .map((update) => `- [[${update.page_name}]]`)
    .join("\n");
  const openQuestions = result.open_questions
    .map((question) => `- ${question}`)
    .join("\n");

  return `${fm}

# ${result.summary.title || rawFileName}

## Source Provenance

- Raw file: \`${rawFileName}\`

## Compiled Summary

${result.summary.content}

## Key Takeaways

${takeaways || "_No key takeaways extracted._"}

## Existing Pages Updated

${updatedPages || "_No existing pages were updated during this compile._"}

## Open Questions

${openQuestions || "_No unresolved questions were recorded._"}
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
  rawFileName: string,
  reason?: string
): string {
  // Update the "updated" date in frontmatter
  const updatedContent = existingRawContent.replace(
    /updated: "[\d-]+"/,
    `updated: "${today()}"`
  );

  // Append new section at the end
  return `${updatedContent.trimEnd()}

## Incremental Update (${today()})

- Source: \`${rawFileName}\`${reason ? `\n- Why now: ${reason}` : ""}

${newContent}
`;
}

function sanitizeSnippet(content: string, limit: number = WIKI_CONTEXT_SNIPPET_LIMIT): string {
  return content.replace(/\s+/g, " ").trim().slice(0, limit);
}

async function buildWikiContext(root: FileSystemDirectoryHandle): Promise<string> {
  const wikiFiles = await listFiles(root, "wiki");
  if (wikiFiles.length === 0) {
    return "No existing wiki pages yet.";
  }

  const prioritized = [...wikiFiles].sort((a, b) => {
    const score = (value: string) => {
      if (value === "wiki/index.md") return 0;
      if (value === "wiki/log.md") return 1;
      if (value.startsWith("wiki/concepts/")) return 2;
      if (value.startsWith("wiki/entities/")) return 3;
      if (value.startsWith("wiki/sources/")) return 4;
      return 5;
    };
    return score(a) - score(b) || a.localeCompare(b);
  });

  const selected = prioritized.slice(0, WIKI_CONTEXT_PAGE_LIMIT);
  const sections: string[] = [];

  for (const filePath of selected) {
    try {
      const raw = await readFile(root, filePath);
      const filename = filePath.split("/").pop() || filePath;
      const page = parseWikiPage(filename, raw);
      sections.push(
        [
          `### ${page.frontmatter.title || page.slug}`,
          `slug: ${page.slug}`,
          `path: ${filePath}`,
          `type: ${page.frontmatter.type}`,
          `sources: ${(page.frontmatter.sources || []).join(", ") || "none"}`,
          `excerpt: ${sanitizeSnippet(page.content) || "(empty)"}`,
        ].join("\n")
      );
    } catch {
      // Skip unreadable pages. Compile should still proceed.
    }
  }

  if (wikiFiles.length > selected.length) {
    sections.push(`... ${wikiFiles.length - selected.length} more wiki pages omitted for brevity.`);
  }

  return sections.join("\n\n");
}

async function buildExistingPagePathMap(root: FileSystemDirectoryHandle): Promise<Map<string, string>> {
  const wikiFiles = await listFiles(root, "wiki");
  const map = new Map<string, string>();

  for (const filePath of wikiFiles) {
    const slug = (filePath.split("/").pop() || filePath).replace(/\.md$/, "");
    map.set(slug, filePath);
  }

  return map;
}

function getFallbackPagePath(
  pageType: "concept" | "entity" | "source" | "analysis" | undefined,
  slug: string
): string | null {
  switch (pageType) {
    case "concept":
      return `wiki/concepts/${slug}.md`;
    case "entity":
      return `wiki/entities/${slug}.md`;
    case "source":
      return `wiki/sources/${slug}.md`;
    case "analysis":
      return `wiki/analyses/${slug}.md`;
    default:
      return null;
  }
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
    let content: string;
    if (file.fileName.toLowerCase().endsWith(".pdf")) {
      log(logs, "info", "Detected PDF, extracting text...");
      const buffer = await readFileAsBuffer(root, file.path);
      content = await extractTextFromPdf(buffer);
      log(logs, "info", "PDF text extracted", `${content.length} chars`);
    } else {
      content = await readFile(root, file.path);
      log(logs, "info", "File read OK", `${content.length} chars`);
    }

    if (!content.trim()) {
      if (file.fileName.toLowerCase().endsWith(".pdf")) {
        throw new Error(
          "이 PDF는 추출 가능한 텍스트가 없습니다. 이미지로만 구성된 PDF로 보이며, OCR 처리가 필요합니다."
        );
      }
      throw new Error("No text content could be extracted from the file");
    }

    // 2. Call LLM via API route
    const wikiContext = await buildWikiContext(root);
    const requestBody = {
      fileName: file.fileName,
      content,
      fileType: file.fileType,
      llmConfig,
      wikiContext,
      language,
    };
    log(logs, "request", `POST /api/llm/ingest`, JSON.stringify({
      fileName: file.fileName,
      fileType: file.fileType,
      contentLength: content.length,
      wikiContextLength: wikiContext.length,
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
      updateCount: llmResult.updates_to_existing_pages?.length ?? 0,
      conceptCount: llmResult.concepts?.length ?? 0,
      entityCount: llmResult.entities?.length ?? 0,
      openQuestionCount: llmResult.open_questions?.length ?? 0,
      tagCount: llmResult.tags?.length ?? 0,
    }, null, 2));

    // 3. Create/update source summary page
    const sourceSlug = toSlug(llmResult.summary.title || file.fileName.replace(/\.[^.]+$/, ""));
    result.sourceSlug = sourceSlug;
    const sourcePath = `wiki/sources/${sourceSlug}.md`;
    const sourceContent = buildSourcePage(llmResult, file.fileName);
    const sourceExisted = await fileExists(root, sourcePath);
    await writeFile(root, sourcePath, sourceContent);
    if (sourceExisted) {
      result.updatedSlugs.push(sourceSlug);
      log(logs, "write", "Updated source page", sourcePath);
    } else {
      result.createdSlugs.push(sourceSlug);
      log(logs, "write", "Created source page", sourcePath);
    }

    // 4. Merge updates into existing pages first
    const existingPagePaths = await buildExistingPagePathMap(root);
    const pagesHandledAsUpdates = new Set<string>();

    for (const update of llmResult.updates_to_existing_pages) {
      const slug = toSlug(update.page_name);
      const existingPath = existingPagePaths.get(slug) || getFallbackPagePath(update.page_type, slug);

      if (!existingPath) {
        log(logs, "info", `Skipped update without resolvable page path`, update.page_name);
        continue;
      }

      if (await fileExists(root, existingPath)) {
        const existing = await readFile(root, existingPath);
        const merged = mergeIntoExistingPage(existing, update.update_content, file.fileName, update.reason);
        await writeFile(root, existingPath, merged);
        result.updatedSlugs.push(slug);
        pagesHandledAsUpdates.add(slug);
        existingPagePaths.set(slug, existingPath);
        log(logs, "write", `Merged update into ${update.page_name}`, existingPath);
      }
    }

    // 5. Create/merge concept pages
    for (const concept of llmResult.concepts) {
      const slug = toSlug(concept.name);
      if (pagesHandledAsUpdates.has(slug)) {
        continue;
      }
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
        existingPagePaths.set(slug, pagePath);
        log(logs, "write", `Created concept: ${concept.name}`, pagePath);
      }
    }

    // 6. Create/merge entity pages
    for (const entity of llmResult.entities) {
      const slug = toSlug(entity.name);
      if (pagesHandledAsUpdates.has(slug)) {
        continue;
      }
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
        existingPagePaths.set(slug, pagePath);
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
