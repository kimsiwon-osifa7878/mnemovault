import { NextResponse } from "next/server";
import { runLint } from "@/lib/llm/lint";
import { LLMConfig } from "@/lib/llm/client";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { llmConfig } = body as { llmConfig?: LLMConfig };

    const config: LLMConfig | undefined = llmConfig
      ? { provider: llmConfig.provider, model: llmConfig.model, ollamaUrl: llmConfig.ollamaUrl }
      : undefined;

    const result = await runLint(config);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
