import { callLLM, LLMConfig } from "./client";

function buildIngestSystemPrompt(language: "en" | "ko"): string {
  if (language === "ko") {
    return `당신은 지식 위키 컴파일러입니다. 주어진 raw 소스를 분석하여 아래 JSON 형식으로 응답하세요.

{
  "summary": {
    "title": "소스 제목",
    "content": "마크다운 형식의 상세 요약 (500자 이상)",
    "key_takeaways": ["핵심 포인트 1", "핵심 포인트 2"]
  },
  "concepts": [
    {
      "name": "개념명",
      "content": "개념 설명 마크다운"
    }
  ],
  "entities": [
    {
      "name": "엔티티명",
      "content": "엔티티 설명 마크다운"
    }
  ],
  "wikilinks": ["[[개념A]]", "[[엔티티B]]"],
  "tags": ["태그1", "태그2"]
}

중요 규칙:
- 모든 교차참조는 [[위키링크]] 문법 사용
- 출처를 반드시 명시
- 모든 내용을 한국어로 작성하세요.
- JSON만 출력하세요. 다른 텍스트는 포함하지 마세요.`;
  }

  return `You are a knowledge wiki compiler. Analyze the given raw source and respond in the following JSON format.

{
  "summary": {
    "title": "Source title",
    "content": "Detailed summary in markdown format (500+ characters)",
    "key_takeaways": ["Key point 1", "Key point 2"]
  },
  "concepts": [
    {
      "name": "Concept name",
      "content": "Concept description in markdown"
    }
  ],
  "entities": [
    {
      "name": "Entity name",
      "content": "Entity description in markdown"
    }
  ],
  "wikilinks": ["[[ConceptA]]", "[[EntityB]]"],
  "tags": ["tag1", "tag2"]
}

Important rules:
- Use [[wikilink]] syntax for all cross-references
- Always cite the source
- Write all content in English.
- Output JSON only. Do not include any other text.`;
}

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
  const systemPrompt = buildIngestSystemPrompt(language);
  const userLabel = language === "ko"
    ? `파일명: ${fileName}\n파일 타입: ${fileType}\n\n내용:\n${content}`
    : `File name: ${fileName}\nFile type: ${fileType}\n\nContent:\n${content}`;

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
