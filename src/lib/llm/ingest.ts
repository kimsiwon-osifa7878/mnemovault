import { callLLM, LLMConfig } from "./client";
import { getPrompt, renderPrompt } from "./prompt-store";

export interface IngestLLMResult {
  summary: { title: string; content: string; key_takeaways: string[] };
  concepts: { name: string; content: string }[];
  entities: { name: string; content: string }[];
  tags: string[];
}

// Server-side only: just calls LLM and returns parsed result
export async function processIngestWithLLM(
  fileName: string,
  content: string,
  fileType: string,
  llmConfig?: LLMConfig,
  language: "en" | "ko" = "en"
): Promise<IngestLLMResult> {
  const systemPrompt = await getPrompt("ingest", "system", language);
  const userTemplate = await getPrompt("ingest", "user", language);
  const userLabel = renderPrompt(userTemplate, { fileName, fileType, content });

  const llmResponse = await callLLM(
    systemPrompt,
    userLabel,
    4096,
    llmConfig
  );

  const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : llmResponse);

  return {
    summary: parsed.summary || { title: fileName, content: "", key_takeaways: [] },
    concepts: parsed.concepts || [],
    entities: parsed.entities || [],
    tags: parsed.tags || [],
  };
}
