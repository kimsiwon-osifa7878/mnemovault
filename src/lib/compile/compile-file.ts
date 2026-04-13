import { readFile, readFileAsBuffer, writeFile, fileExists, listFiles } from "@/lib/storage/client-fs";
import { extractTextFromPdf } from "@/lib/utils/pdf";
import { toSlug } from "@/lib/utils/markdown";
import type {
  UncompiledFile,
  CompileFileResult,
  CompileLogEntry,
} from "./types";
import type {
  ClaimResult,
  EdgeResult,
  EvidenceType,
  IngestLLMResult,
} from "@/lib/llm/ingest";
import { parseWikiPage } from "@/lib/wiki/parser";
import { sha256Buffer } from "@/lib/utils/hash";
import { COMPILE_PIPELINE_VERSION } from "./processed-files";

interface LLMConfig {
  provider: "openrouter" | "ollama";
  model: string;
  ollamaUrl?: string;
}

const today = () => new Date().toISOString().split("T")[0];
const WIKI_CONTEXT_PAGE_LIMIT = 24;
const WIKI_CONTEXT_SNIPPET_LIMIT = 360;
const EVIDENCE_BLOCK_TAG = "mnemovault-evidence";
const STREAM_LOG_FLUSH_INTERVAL_MS = 250;
const STREAM_LOG_FLUSH_CHAR_THRESHOLD = 120;

interface PageEvidence {
  claims: ClaimResult[];
  edges: EdgeResult[];
}

interface CompileFileHooks {
  emitLog?: (entry: CompileLogEntry) => Promise<void> | void;
  emitStreamChunk?: (filePath: string, chunk: string) => Promise<void> | void;
}

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
  const evidence = buildEvidenceSection(
    {
      claims: filterClaimsForPage(result.claims, result.summary.title),
      edges: filterEdgesForPage(result.edges, result.summary.title),
    },
    rawFileName
  );

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

${evidence}
`;
}

function buildNewConceptOrEntityPage(
  name: string,
  content: string,
  type: "concept" | "entity",
  rawFileName: string,
  tags: string[],
  evidence: PageEvidence
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

${buildEvidenceSection(evidence, rawFileName)}
`;
}

function formatEvidenceType(type: EvidenceType): string {
  switch (type) {
    case "EXTRACTED":
      return "Extracted";
    case "INFERRED":
      return "Inferred";
    case "AMBIGUOUS":
      return "Ambiguous";
  }
}

function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

function sanitizeEvidenceInline(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function filterClaimsForPage(
  claims: ClaimResult[] | undefined,
  pageName: string
): ClaimResult[] {
  const slug = toSlug(pageName);
  return (claims || []).filter((claim) => toSlug(claim.page_name) === slug);
}

function filterEdgesForPage(
  edges: EdgeResult[] | undefined,
  pageName: string
): EdgeResult[] {
  const slug = toSlug(pageName);
  return (edges || []).filter(
    (edge) =>
      toSlug(edge.source_page) === slug || toSlug(edge.target_page) === slug
  );
}

function buildEvidenceBlock(evidence: PageEvidence): string {
  return [
    `\`\`\`${EVIDENCE_BLOCK_TAG}`,
    JSON.stringify(evidence, null, 2),
    "```",
  ].join("\n");
}

function buildEvidenceSection(
  evidence: PageEvidence,
  rawFileName: string,
  reason?: string
): string {
  const claimLines = evidence.claims.map((claim) => {
    const ref = sanitizeEvidenceInline(claim.source_ref || rawFileName);
    return `- ${claim.text} (${formatEvidenceType(claim.evidence_type)}, ${formatConfidence(claim.confidence)}, \`${ref}\`)`;
  });

  const edgeLines = evidence.edges.map((edge) => {
    const ref = sanitizeEvidenceInline(edge.source_ref || rawFileName);
    return `- [[${edge.source_page}]] -- ${edge.relation} --> [[${edge.target_page}]] (${formatEvidenceType(edge.evidence_type)}, ${formatConfidence(edge.confidence)}, \`${ref}\`)`;
  });

  if (claimLines.length === 0 && edgeLines.length === 0) {
    return [
      "## Evidence",
      "",
      `- Source reference: \`${rawFileName}\`${reason ? ` (${reason})` : ""}`,
    ].join("\n");
  }

  return [
    "## Evidence",
    "",
    `- Source reference: \`${rawFileName}\`${reason ? ` (${reason})` : ""}`,
    "",
    "### Claims",
    "",
    claimLines.join("\n") || "_No claim-level evidence recorded._",
    "",
    "### Relationships",
    "",
    edgeLines.join("\n") || "_No relationship evidence recorded._",
    "",
    buildEvidenceBlock(evidence),
  ].join("\n");
}

function mergeIntoExistingPage(
  existingRawContent: string,
  newContent: string,
  rawFileName: string,
  reason?: string,
  evidence?: PageEvidence
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

${buildEvidenceSection(evidence || { claims: [], edges: [] }, rawFileName, reason)}
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

function createLogger(
  logs: CompileLogEntry[],
  filePath: string,
  hooks?: CompileFileHooks
) {
  return async (
    type: CompileLogEntry["type"],
    scope: CompileLogEntry["scope"],
    label: string,
    detail?: string,
    stage?: string
  ) => {
    const entry: CompileLogEntry = {
      timestamp: Date.now(),
      type,
      scope,
      label,
      detail,
      filePath,
      stage,
    };
    logs.push(entry);
    await hooks?.emitLog?.(entry);
  };
}

function readSseBlocks(chunk: string, carry: string): { blocks: string[]; remainder: string } {
  const combined = `${carry}${chunk}`;
  const parts = combined.split(/\r?\n\r?\n/);
  const remainder = parts.pop() || "";
  return { blocks: parts, remainder };
}

function parseSseBlock(block: string): { event: string; data: string } | null {
  const lines = block.split(/\r?\n/);
  let event = "message";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  if (dataLines.length === 0) {
    return null;
  }

  return { event, data: dataLines.join("\n") };
}

function sanitizeDebugName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

function buildDebugPath(fileName: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `meta/llm-debug/${timestamp}-${sanitizeDebugName(fileName)}-ingest-request.json`;
}

export async function compileFile(
  root: FileSystemDirectoryHandle,
  file: UncompiledFile,
  llmConfig: LLMConfig,
  existingSlugs: Set<string>,
  language: "en" | "ko" = "en",
  hooks?: CompileFileHooks,
  options?: { logEnabled?: boolean }
): Promise<CompileFileResult> {
  const logs: CompileLogEntry[] = [];
  const result: CompileFileResult = {
    file,
    sourceSlug: "",
    createdSlugs: [],
    updatedSlugs: [],
    logs,
  };
  const logEnabled = options?.logEnabled ?? true;
  const log = logEnabled
    ? createLogger(logs, file.path, hooks)
    : async () => undefined;

  try {
    // 1. Read raw file
    await log("info", "file", "Reading raw file", file.path, "read_raw");
    let content: string;
    if (file.fileName.toLowerCase().endsWith(".pdf")) {
      await log(
        "info",
        "file",
        "Detected PDF, extracting text...",
        undefined,
        "extract_pdf"
      );
      const buffer = await readFileAsBuffer(root, file.path);
      content = await extractTextFromPdf(buffer);
      await log(
        "info",
        "file",
        "PDF text extracted",
        `${content.length} chars`,
        "extract_pdf_done"
      );
    } else {
      content = await readFile(root, file.path);
      await log("info", "file", "File read OK", `${content.length} chars`, "read_raw_done");
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
    await log("info", "file", "Building wiki context", undefined, "build_context");
    const wikiContext = await buildWikiContext(root);
    await log(
      "info",
      "file",
      "Wiki context ready",
      `${wikiContext.length} chars`,
      "build_context_done"
    );
    const requestBody = {
      fileName: file.fileName,
      content,
      fileType: file.fileType,
      llmConfig,
      wikiContext,
      language,
    };
    const debugPath = buildDebugPath(file.fileName);
    await log("request", "file", `POST /api/llm/ingest`, JSON.stringify({
      fileName: file.fileName,
      fileType: file.fileType,
      contentLength: content.length,
      wikiContextLength: wikiContext.length,
      llmConfig,
      debugPath,
    }, null, 2), "request_ingest");

    const res = await fetch("/api/llm/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      const responseText = await res.text();
      await log("error", "file", `API ${res.status} ${res.statusText}`, responseText, "request_failed");
      throw new Error(`API error ${res.status}: ${responseText}`);
    }

    if (!res.body) {
      throw new Error("Streaming ingest response body is missing");
    }

    await log("response", "file", "LLM stream connected", undefined, "stream_connected");
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let rawResponse = "";
    let llmResult: IngestLLMResult | null = null;
    let streamError: string | null = null;
    let debugSaved = false;
    let pendingStreamLog = "";
    let lastStreamLogAt = Date.now();

    const flushStreamLog = async (force: boolean = false) => {
      if (!pendingStreamLog) return;

      const elapsed = Date.now() - lastStreamLogAt;
      if (
        !force &&
        pendingStreamLog.length < STREAM_LOG_FLUSH_CHAR_THRESHOLD &&
        elapsed < STREAM_LOG_FLUSH_INTERVAL_MS
      ) {
        return;
      }

      const text = pendingStreamLog;
      pendingStreamLog = "";
      lastStreamLogAt = Date.now();
      await log(
        "response",
        "llm_stream",
        "LLM chunk",
        text,
        "stream_chunk"
      );
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunkText = decoder.decode(value, { stream: true });
      const parsed = readSseBlocks(chunkText, buffer);
      buffer = parsed.remainder;

      for (const block of parsed.blocks) {
        const message = parseSseBlock(block);
        if (!message) continue;

        if (message.event === "status") {
          try {
            const payload = JSON.parse(message.data) as { stage?: string };
            await log(
              "response",
              "file",
              `LLM status: ${payload.stage || "unknown"}`,
              undefined,
              payload.stage
            );
          } catch {
            continue;
          }
          continue;
        }

        if (message.event === "debug_payload") {
          if (!logEnabled) {
            continue;
          }
          try {
            const payload = JSON.parse(message.data) as Record<string, unknown>;
            await writeFile(root, debugPath, JSON.stringify(payload, null, 2));
            debugSaved = true;
            await log(
              "request",
              "file",
              "OpenRouter request debug saved",
              debugPath,
              "debug_saved"
            );
          } catch (error) {
            await log(
              "error",
              "file",
              "Failed to save OpenRouter request debug",
              (error as Error).message,
              "debug_save_failed"
            );
          }
          continue;
        }

        if (message.event === "chunk") {
          try {
            const payload = JSON.parse(message.data) as { text?: string };
            const text = payload.text || "";
            rawResponse += text;
            await hooks?.emitStreamChunk?.(file.path, text);
            pendingStreamLog += text;
            await flushStreamLog();
          } catch {
            continue;
          }
          continue;
        }

        if (message.event === "complete") {
          llmResult = JSON.parse(message.data) as IngestLLMResult;
          await log("response", "file", "LLM stream complete", undefined, "stream_complete");
          continue;
        }

        if (message.event === "error") {
          streamError = message.data;
          await log("error", "file", "LLM stream error", message.data, "stream_error");
        }
      }
    }

    await flushStreamLog(true);

    if (buffer.trim()) {
      const finalMessage = parseSseBlock(buffer.trim());
      if (finalMessage?.event === "error") {
        streamError = finalMessage.data;
      }
    }

    if (!llmResult) {
      if (streamError) {
        throw new Error(`Streaming ingest failed: ${streamError}`);
      }
      await log("error", "file", "JSON parse failed", rawResponse.slice(0, 500), "parse_failed");
      throw new Error("Invalid streaming ingest response");
    }

    await log("response", "file", "LLM response OK", JSON.stringify({
      summaryTitle: llmResult.summary?.title,
      updateCount: llmResult.updates_to_existing_pages?.length ?? 0,
      conceptCount: llmResult.concepts?.length ?? 0,
      entityCount: llmResult.entities?.length ?? 0,
      openQuestionCount: llmResult.open_questions?.length ?? 0,
      tagCount: llmResult.tags?.length ?? 0,
    }, null, 2), "response_ready");
    if (logEnabled && !debugSaved) {
      await log(
        "info",
        "file",
        "OpenRouter request debug not emitted",
        debugPath,
        "debug_missing"
      );
    }

    // 3. Create/update source summary page
    const sourceSlug = toSlug(llmResult.summary.title || file.fileName.replace(/\.[^.]+$/, ""));
    result.sourceSlug = sourceSlug;
    const sourcePath = `wiki/sources/${sourceSlug}.md`;
    const sourceContent = buildSourcePage(llmResult, file.fileName);
    const sourceExisted = await fileExists(root, sourcePath);
    await log("write", "file", "Writing source page", sourcePath, "write_source");
    await writeFile(root, sourcePath, sourceContent);
    if (sourceExisted) {
      result.updatedSlugs.push(sourceSlug);
      await log("write", "file", "Updated source page", sourcePath, "write_source_done");
    } else {
      result.createdSlugs.push(sourceSlug);
      await log("write", "file", "Created source page", sourcePath, "write_source_done");
    }

    // 4. Merge updates into existing pages first
    const existingPagePaths = await buildExistingPagePathMap(root);
    const pagesHandledAsUpdates = new Set<string>();

    for (const update of llmResult.updates_to_existing_pages) {
      const slug = toSlug(update.page_name);
      const existingPath = existingPagePaths.get(slug) || getFallbackPagePath(update.page_type, slug);

      if (!existingPath) {
        await log("info", "file", `Skipped update without resolvable page path`, update.page_name, "skip_update");
        continue;
      }

      if (await fileExists(root, existingPath)) {
        const existing = await readFile(root, existingPath);
        const merged = mergeIntoExistingPage(
          existing,
          update.update_content,
          file.fileName,
          update.reason,
          {
            claims: filterClaimsForPage(llmResult.claims, update.page_name),
            edges: filterEdgesForPage(llmResult.edges, update.page_name),
          }
        );
        await writeFile(root, existingPath, merged);
        result.updatedSlugs.push(slug);
        pagesHandledAsUpdates.add(slug);
        existingPagePaths.set(slug, existingPath);
        await log("write", "file", `Merged update into ${update.page_name}`, existingPath, "merge_update");
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
          const merged = mergeIntoExistingPage(
            existing,
            concept.content,
            file.fileName,
            undefined,
            {
              claims: filterClaimsForPage(llmResult.claims, concept.name),
              edges: filterEdgesForPage(llmResult.edges, concept.name),
            }
          );
          await writeFile(root, pagePath, merged);
          result.updatedSlugs.push(slug);
          await log("write", "file", `Merged concept: ${concept.name}`, pagePath, "merge_concept");
        } catch {
          const page = buildNewConceptOrEntityPage(
            concept.name,
            concept.content,
            "concept",
            file.fileName,
            llmResult.tags,
            {
              claims: filterClaimsForPage(llmResult.claims, concept.name),
              edges: filterEdgesForPage(llmResult.edges, concept.name),
            }
          );
          await writeFile(root, pagePath, page);
          result.createdSlugs.push(slug);
          await log("write", "file", `Created concept: ${concept.name}`, pagePath, "create_concept");
        }
      } else {
        const page = buildNewConceptOrEntityPage(
          concept.name,
          concept.content,
          "concept",
          file.fileName,
          llmResult.tags,
          {
            claims: filterClaimsForPage(llmResult.claims, concept.name),
            edges: filterEdgesForPage(llmResult.edges, concept.name),
          }
        );
        await writeFile(root, pagePath, page);
        result.createdSlugs.push(slug);
        existingSlugs.add(slug);
        existingPagePaths.set(slug, pagePath);
        await log("write", "file", `Created concept: ${concept.name}`, pagePath, "create_concept");
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
          const merged = mergeIntoExistingPage(
            existing,
            entity.content,
            file.fileName,
            undefined,
            {
              claims: filterClaimsForPage(llmResult.claims, entity.name),
              edges: filterEdgesForPage(llmResult.edges, entity.name),
            }
          );
          await writeFile(root, pagePath, merged);
          result.updatedSlugs.push(slug);
          await log("write", "file", `Merged entity: ${entity.name}`, pagePath, "merge_entity");
        } catch {
          const page = buildNewConceptOrEntityPage(
            entity.name,
            entity.content,
            "entity",
            file.fileName,
            llmResult.tags,
            {
              claims: filterClaimsForPage(llmResult.claims, entity.name),
              edges: filterEdgesForPage(llmResult.edges, entity.name),
            }
          );
          await writeFile(root, pagePath, page);
          result.createdSlugs.push(slug);
          await log("write", "file", `Created entity: ${entity.name}`, pagePath, "create_entity");
        }
      } else {
        const page = buildNewConceptOrEntityPage(
          entity.name,
          entity.content,
          "entity",
          file.fileName,
          llmResult.tags,
          {
            claims: filterClaimsForPage(llmResult.claims, entity.name),
            edges: filterEdgesForPage(llmResult.edges, entity.name),
          }
        );
        await writeFile(root, pagePath, page);
        result.createdSlugs.push(slug);
        existingSlugs.add(slug);
        existingPagePaths.set(slug, pagePath);
        await log("write", "file", `Created entity: ${entity.name}`, pagePath, "create_entity");
      }
    }

    result.processedMeta = {
      path: file.path,
      sha256: sha256Buffer(await readFileAsBuffer(root, file.path)),
      compiled_at: new Date().toISOString(),
      pipeline_version: COMPILE_PIPELINE_VERSION,
    };
    await log(
      "info",
      "file",
      "Compile complete",
      `${result.createdSlugs.length} created, ${result.updatedSlugs.length} updated`,
      "compile_done"
    );
  } catch (e) {
    result.error = (e as Error).message;
    if (!logs.some((l) => l.type === "error")) {
      await log("error", "file", "Unexpected error", (e as Error).message, "compile_error");
    }
  }

  return result;
}
