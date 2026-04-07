import { callLLM, LLMConfig } from "./client";

const QUERY_SYSTEM_PROMPT = `당신은 위키 기반 지식 어시스턴트입니다.
주어진 위키 컨텍스트를 기반으로 질문에 답변하세요.

규칙:
- 위키에 있는 정보를 기반으로 답변
- 교차참조는 [[위키링크]] 문법 사용
- 출처 페이지를 명시
- 위키에 없는 정보는 명확히 구분하여 표시
- 마크다운 형식으로 답변`;

// Server-side only: takes pre-built context, calls LLM, returns answer
export async function answerWithLLM(
  question: string,
  context: string,
  llmConfig?: LLMConfig
): Promise<string> {
  return callLLM(
    QUERY_SYSTEM_PROMPT,
    `위키 컨텍스트:\n${context}\n\n질문: ${question}`,
    4096,
    llmConfig
  );
}
