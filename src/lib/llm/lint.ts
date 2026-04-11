import { callLLM, LLMConfig } from "./client";
import { getPrompt } from "./prompt-store";

export interface LLMLintResult {
  description: string;
  pages: string[];
}

// Server-side only: takes page summaries, calls LLM for contradiction detection
export async function detectContradictions(
  pageSummaries: string,
  llmConfig?: LLMConfig,
  language: "en" | "ko" = "en"
): Promise<LLMLintResult[]> {
  try {
    const systemPrompt = await getPrompt("lint", "system", language);
    const llmResponse = await callLLM(
      systemPrompt,
      pageSummaries,
      2048,
      llmConfig
    );

    const jsonMatch = llmResponse.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return [];
  } catch {
    return [];
  }
}
