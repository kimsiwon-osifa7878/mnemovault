import { callLLM, callLLMStream, LLMConfig } from "./client";
import { LLMRequestError } from "./errors";
import { getPrompt, renderPrompt } from "./prompt-store";

export type EvidenceType = "EXTRACTED" | "INFERRED" | "AMBIGUOUS";

export interface ClaimResult {
  text: string;
  page_name: string;
  evidence_type: EvidenceType;
  confidence: number;
  source_ref: string;
}

export interface EdgeResult {
  source_page: string;
  target_page: string;
  relation: string;
  evidence_type: EvidenceType;
  confidence: number;
  source_ref: string;
}

export interface IngestLLMResult {
  summary: { title: string; content: string; key_takeaways: string[] };
  concepts: { name: string; content: string }[];
  entities: { name: string; content: string }[];
  tags: string[];
  updates_to_existing_pages: {
    page_name: string;
    page_type?: "concept" | "entity" | "source" | "analysis";
    update_content: string;
    reason?: string;
  }[];
  open_questions: string[];
  index_entry?: string;
  log_entry?: string;
  claims?: ClaimResult[];
  edges?: EdgeResult[];
}

export interface IngestStreamResult {
  result: IngestLLMResult;
  rawResponse: string;
  chunkCount: number;
}

function extractTopLevelJsonObjects(text: string): string[] {
  const objects: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaping = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inString) {
      if (escaping) {
        escaping = false;
        continue;
      }
      if (char === "\\") {
        escaping = true;
        continue;
      }
      if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      if (depth === 0) {
        start = i;
      }
      depth += 1;
      continue;
    }

    if (char === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        objects.push(text.slice(start, i + 1).trim());
        start = -1;
      }
    }
  }

  return objects;
}

function extractJsonPayloads(text: string): string[] {
  const fencedMatches = [...text.matchAll(/```json\s*([\s\S]*?)```/gi)]
    .map((match) => match[1]?.trim())
    .filter((candidate): candidate is string => !!candidate);
  if (fencedMatches.length > 0) {
    return fencedMatches;
  }

  const topLevelObjects = extractTopLevelJsonObjects(text);
  if (topLevelObjects.length > 0) {
    return topLevelObjects;
  }

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return [text.slice(firstBrace, lastBrace + 1)];
  }

  const trimmed = text.trim();
  return trimmed ? [trimmed] : [];
}

export function extractJsonPayload(text: string): string {
  const [firstPayload] = extractJsonPayloads(text);
  return firstPayload ?? text.trim();
}

function buildMissingJsonClosers(text: string): string | null {
  const stack: string[] = [];
  let inString = false;
  let escaping = false;

  for (const char of text) {
    if (inString) {
      if (escaping) {
        escaping = false;
        continue;
      }
      if (char === "\\") {
        escaping = true;
        continue;
      }
      if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      stack.push("}");
      continue;
    }

    if (char === "[") {
      stack.push("]");
      continue;
    }

    if (char === "}" || char === "]") {
      const expected = stack.pop();
      if (expected !== char) {
        return null;
      }
    }
  }

  if (inString) {
    return null;
  }

  return stack.reverse().join("");
}

export function parseJsonWithAutoClose<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch (initialError) {
    const missingClosers = buildMissingJsonClosers(text);
    if (!missingClosers) {
      throw initialError;
    }

    const candidates = [
      `${text}${missingClosers}`,
      `${text.trimEnd()}${missingClosers}`,
    ];

    for (const candidate of candidates) {
      try {
        return JSON.parse(candidate) as T;
      } catch {
        continue;
      }
    }

    throw initialError;
  }
}

function isEvidenceType(value: unknown): value is EvidenceType {
  return (
    value === "EXTRACTED" || value === "INFERRED" || value === "AMBIGUOUS"
  );
}

function normalizeConfidence(value: unknown): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0.5;
  }

  return Math.max(0, Math.min(1, value));
}

function parseClaims(value: unknown): ClaimResult[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const claim = item as Record<string, unknown>;
    if (
      typeof claim.text !== "string" ||
      typeof claim.page_name !== "string" ||
      typeof claim.source_ref !== "string" ||
      !isEvidenceType(claim.evidence_type)
    ) {
      return [];
    }

    return [
      {
        text: claim.text,
        page_name: claim.page_name,
        evidence_type: claim.evidence_type,
        confidence: normalizeConfidence(claim.confidence),
        source_ref: claim.source_ref,
      },
    ];
  });
}

function parseEdges(value: unknown): EdgeResult[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const edge = item as Record<string, unknown>;
    if (
      typeof edge.source_page !== "string" ||
      typeof edge.target_page !== "string" ||
      typeof edge.relation !== "string" ||
      typeof edge.source_ref !== "string" ||
      !isEvidenceType(edge.evidence_type)
    ) {
      return [];
    }

    return [
      {
        source_page: edge.source_page,
        target_page: edge.target_page,
        relation: edge.relation,
        evidence_type: edge.evidence_type,
        confidence: normalizeConfidence(edge.confidence),
        source_ref: edge.source_ref,
      },
    ];
  });
}

function pickPrimaryIngestObject(
  parsedObjects: Record<string, unknown>[]
): Record<string, unknown> {
  const keys = [
    "summary",
    "summary_page",
    "concepts",
    "entities",
    "updates_to_existing_pages",
    "open_questions",
    "unresolved_questions",
    "tags",
    "index_entry",
    "log_entry",
  ];
  const scored = parsedObjects
    .map((candidate) => ({
      candidate,
      score: keys.reduce(
        (acc, key) => (Object.prototype.hasOwnProperty.call(candidate, key) ? acc + 1 : acc),
        0
      ),
    }))
    .sort((a, b) => b.score - a.score);

  return scored[0]?.candidate ?? parsedObjects[0];
}

function dedupeClaims(claims: ClaimResult[]): ClaimResult[] {
  const seen = new Set<string>();
  return claims.filter((claim) => {
    const key = `${claim.text}::${claim.page_name}::${claim.evidence_type}::${claim.source_ref}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function dedupeEdges(edges: EdgeResult[]): EdgeResult[] {
  const seen = new Set<string>();
  return edges.filter((edge) => {
    const key =
      `${edge.source_page}::${edge.target_page}::${edge.relation}::` +
      `${edge.evidence_type}::${edge.source_ref}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export async function buildIngestPrompt(
  fileName: string,
  content: string,
  fileType: string,
  wikiContext: string = "",
  language: "en" | "ko" = "en"
): Promise<{ systemPrompt: string; userMessage: string }> {
  const systemPrompt = await getPrompt("ingest", "system", language);
  const userTemplate = await getPrompt("ingest", "user", language);
  const userMessage = renderPrompt(userTemplate, {
    fileName,
    fileType,
    content,
    wikiContext: wikiContext.trim() || "No existing wiki pages yet.",
  });

  return { systemPrompt, userMessage };
}

export function parseIngestLLMResponse(
  fileName: string,
  llmResponse: string,
  llmConfig?: LLMConfig
): IngestLLMResult {
  const jsonPayloads = extractJsonPayloads(llmResponse);
  const parsedObjects: Record<string, unknown>[] = [];
  let parseError: unknown;
  for (const payload of jsonPayloads) {
    try {
      parsedObjects.push(parseJsonWithAutoClose<Record<string, unknown>>(payload));
    } catch (error) {
      parseError = parseError || error;
    }
  }

  if (parsedObjects.length === 0) {
    throw new LLMRequestError(
      "invalid_response",
      "LLM returned a non-JSON response for ingest request.",
      {
        retryable: false,
        cause: parseError,
        details: {
          model: llmConfig?.model,
          provider: llmConfig?.provider,
          responsePreview: llmResponse.slice(0, 400),
        },
      }
    );
  }

  const parsed = pickPrimaryIngestObject(parsedObjects);
  const typed = parsed as Record<string, unknown> & {
    summary?: Record<string, unknown>;
    summary_page?: Record<string, unknown>;
  };

  const summaryNode = typed.summary || typed.summary_page || {};
  const concepts = (Array.isArray(typed.concepts) ? typed.concepts : []) as IngestLLMResult["concepts"];
  const entities = (Array.isArray(typed.entities) ? typed.entities : []) as IngestLLMResult["entities"];
  const updates = (Array.isArray(typed.updates_to_existing_pages)
    ? typed.updates_to_existing_pages
    : []) as IngestLLMResult["updates_to_existing_pages"];
  const openQuestions = (Array.isArray(typed.open_questions)
    ? typed.open_questions
    : Array.isArray(typed.unresolved_questions)
      ? typed.unresolved_questions
      : []) as string[];
  const tags = (Array.isArray(typed.tags) ? typed.tags : []) as string[];
  const claims = dedupeClaims(parsedObjects.flatMap((obj) => parseClaims(obj.claims)));
  const edges = dedupeEdges(parsedObjects.flatMap((obj) => parseEdges(obj.edges)));

  return {
    summary: {
      title: typeof summaryNode.title === "string" ? summaryNode.title : fileName,
      content: typeof summaryNode.content === "string" ? summaryNode.content : "",
      key_takeaways: Array.isArray(summaryNode.key_takeaways)
        ? (summaryNode.key_takeaways as string[])
        : [],
    },
    concepts,
    entities,
    tags,
    updates_to_existing_pages: updates,
    open_questions: openQuestions,
    index_entry: typeof typed.index_entry === "string" ? typed.index_entry : undefined,
    log_entry: typeof typed.log_entry === "string" ? typed.log_entry : undefined,
    claims,
    edges,
  };
}

// Server-side only: just calls LLM and returns parsed result
export async function processIngestWithLLM(
  fileName: string,
  content: string,
  fileType: string,
  llmConfig?: LLMConfig,
  wikiContext: string = "",
  language: "en" | "ko" = "en",
  signal?: AbortSignal
): Promise<IngestLLMResult> {
  const { systemPrompt, userMessage } = await buildIngestPrompt(
    fileName,
    content,
    fileType,
    wikiContext,
    language
  );

  const llmResponse = await callLLM(
    systemPrompt,
    userMessage,
    2400,
    llmConfig,
    {
      requireJson: true,
      temperature: 0,
      signal,
    }
  );

  return parseIngestLLMResponse(fileName, llmResponse, llmConfig);
}

export async function processIngestWithLLMStream(
  fileName: string,
  content: string,
  fileType: string,
  llmConfig?: LLMConfig,
  wikiContext: string = "",
  language: "en" | "ko" = "en",
  onChunk?: (text: string) => void | Promise<void>,
  signal?: AbortSignal
): Promise<IngestStreamResult> {
  const { systemPrompt, userMessage } = await buildIngestPrompt(
    fileName,
    content,
    fileType,
    wikiContext,
    language
  );

  let rawResponse = "";
  let chunkCount = 0;

  for await (const chunk of callLLMStream(
    systemPrompt,
    userMessage,
    2400,
    llmConfig,
    {
      requireJson: true,
      temperature: 0,
      signal,
    }
  )) {
    rawResponse += chunk.text;
    chunkCount += 1;
    await onChunk?.(chunk.text);
  }

  return {
    result: parseIngestLLMResponse(fileName, rawResponse, llmConfig),
    rawResponse,
    chunkCount,
  };
}
