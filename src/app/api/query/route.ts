import { NextResponse } from "next/server";
import { runQuery } from "@/lib/llm/query";
import { LLMConfig } from "@/lib/llm/client";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { question, currentDocument, fileAsPage, llmConfig } = body;

    if (!question) {
      return NextResponse.json({ error: "question is required" }, { status: 400 });
    }

    const config: LLMConfig | undefined = llmConfig
      ? { provider: llmConfig.provider, model: llmConfig.model, ollamaUrl: llmConfig.ollamaUrl }
      : undefined;

    const result = await runQuery({ question, currentDocument, fileAsPage }, config);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
