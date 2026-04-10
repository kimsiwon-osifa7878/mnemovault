import { callLLM, LLMConfig } from "./client";
import { getPrompt, renderPrompt } from "./prompt-store";

// Server-side only: takes pre-built context, calls LLM, returns answer
export async function answerWithLLM(
  question: string,
  context: string,
  llmConfig?: LLMConfig,
  language: "en" | "ko" = "en"
): Promise<string> {
  const systemPrompt = await getPrompt("query", "system", language);
  const userTemplate = await getPrompt("query", "user", language);
  const userMessage = renderPrompt(userTemplate, { context, question });

  return callLLM(systemPrompt, userMessage, 4096, llmConfig);
}
