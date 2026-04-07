import { NextResponse } from "next/server";
import { detectContradictions } from "@/lib/llm/lint";
import { LLMConfig } from "@/lib/llm/client";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { pageSummaries, llmConfig } = body;

    if (!pageSummaries) {
      return NextResponse.json(
        { error: "pageSummaries is required" },
        { status: 400 }
      );
    }

    const config: LLMConfig | undefined = llmConfig
      ? { provider: llmConfig.provider, model: llmConfig.model, ollamaUrl: llmConfig.ollamaUrl }
      : undefined;

    const contradictions = await detectContradictions(pageSummaries, config);
    return NextResponse.json({ contradictions });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
