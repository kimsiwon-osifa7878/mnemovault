import { callLLM, LLMConfig } from "./client";
import { LLMRequestError } from "./errors";
import { getPrompt, renderPrompt } from "./prompt-store";

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

// Server-side only: just calls LLM and returns parsed result
export async function processIngestWithLLM(
  fileName: string,
  content: string,
  fileType: string,
  llmConfig?: LLMConfig,
  wikiContext: string = "",
  language: "en" | "ko" = "en"
): Promise<IngestLLMResult> {
  const systemPrompt = await getPrompt("ingest", "system", language);
  const userTemplate = await getPrompt("ingest", "user", language);
  const userLabel = renderPrompt(userTemplate, {
    fileName,
    fileType,
    content,
    wikiContext: wikiContext.trim() || "No existing wiki pages yet.",
  });

  const llmResponse = await callLLM(
    systemPrompt,
    userLabel,
    4096,
    llmConfig
  );

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
  };
}
