import { callLLM, LLMConfig } from "./client";

export interface LLMLintResult {
  description: string;
  pages: string[];
}

// Server-side only: takes page summaries, calls LLM for contradiction detection
export async function detectContradictions(
  pageSummaries: string,
  llmConfig?: LLMConfig
): Promise<LLMLintResult[]> {
  try {
    const llmResponse = await callLLM(
      `위키 페이지들을 분석하여 모순이나 불일치를 찾으세요. JSON 배열로 응답: [{"description": "모순 설명", "pages": ["page1", "page2"]}]. 모순이 없으면 빈 배열 [] 을 반환하세요.`,
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
