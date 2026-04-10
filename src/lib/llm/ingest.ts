import { callLLM, LLMConfig } from "./client";
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

  const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : llmResponse);

  const summaryNode = parsed.summary || parsed.summary_page || {};
  const concepts = Array.isArray(parsed.concepts) ? parsed.concepts : [];
  const entities = Array.isArray(parsed.entities) ? parsed.entities : [];
  const updates = Array.isArray(parsed.updates_to_existing_pages)
    ? parsed.updates_to_existing_pages
    : [];
  const openQuestions = Array.isArray(parsed.open_questions)
    ? parsed.open_questions
    : Array.isArray(parsed.unresolved_questions)
      ? parsed.unresolved_questions
      : [];
  const tags = Array.isArray(parsed.tags) ? parsed.tags : [];

  return {
    summary: {
      title: summaryNode.title || fileName,
      content: summaryNode.content || "",
      key_takeaways: Array.isArray(summaryNode.key_takeaways)
        ? summaryNode.key_takeaways
        : [],
    },
    concepts,
    entities,
    tags,
    updates_to_existing_pages: updates,
    open_questions: openQuestions,
    index_entry: typeof parsed.index_entry === "string" ? parsed.index_entry : undefined,
    log_entry: typeof parsed.log_entry === "string" ? parsed.log_entry : undefined,
  };
}
