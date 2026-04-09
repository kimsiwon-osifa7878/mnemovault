import { callLLM, LLMConfig } from "./client";

export interface LLMLintResult {
  description: string;
  pages: string[];
}

function buildLintPrompt(language: "en" | "ko"): string {
  if (language === "ko") {
    return `위키 페이지들을 분석하여 모순이나 불일치를 찾으세요. JSON 배열로 응답: [{"description": "모순 설명", "pages": ["page1", "page2"]}]. 모순이 없으면 빈 배열 [] 을 반환하세요. 설명은 한국어로 작성하세요.`;
  }
  return `Analyze the wiki pages and find contradictions or inconsistencies. Respond as a JSON array: [{"description": "description of the contradiction", "pages": ["page1", "page2"]}]. If there are no contradictions, return an empty array []. Write all descriptions in English.`;
}

// Server-side only: takes page summaries, calls LLM for contradiction detection
export async function detectContradictions(
  pageSummaries: string,
  llmConfig?: LLMConfig,
  language: "en" | "ko" = "en"
): Promise<LLMLintResult[]> {
  try {
    const llmResponse = await callLLM(
      buildLintPrompt(language),
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
