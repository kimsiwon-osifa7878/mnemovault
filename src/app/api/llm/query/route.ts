import { NextResponse } from "next/server";
import { answerWithLLM } from "@/lib/llm/query";
import { LLMConfig } from "@/lib/llm/client";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { question, context, llmConfig } = body;

    if (!question || !context) {
      return NextResponse.json(
        { error: "question and context are required" },
        { status: 400 }
      );
    }

    const config: LLMConfig | undefined = llmConfig
      ? { provider: llmConfig.provider, model: llmConfig.model, ollamaUrl: llmConfig.ollamaUrl }
      : undefined;

    const answer = await answerWithLLM(question, context, config);
    return NextResponse.json({ answer });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
