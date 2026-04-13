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

export function extractJsonPayload(text: string): string {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }

  return text.trim();
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
  const jsonPayload = extractJsonPayload(llmResponse);
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonPayload) as Record<string, unknown>;
  } catch (error) {
    throw new LLMRequestError(
      "invalid_response",
      "LLM returned a non-JSON response for ingest request.",
      {
        retryable: false,
        cause: error,
        details: {
          model: llmConfig?.model,
          provider: llmConfig?.provider,
          responsePreview: llmResponse.slice(0, 400),
        },
      }
    );
  }

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
  const claims = parseClaims(typed.claims);
  const edges = parseEdges(typed.edges);

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
  language: "en" | "ko" = "en"
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
  onChunk?: (text: string) => void | Promise<void>
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
