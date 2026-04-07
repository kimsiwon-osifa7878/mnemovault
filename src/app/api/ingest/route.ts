import { NextResponse } from "next/server";
import { runIngest } from "@/lib/llm/ingest";
import { LLMConfig } from "@/lib/llm/client";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { fileName, content, fileType, llmConfig } = body;

    if (!fileName || !content || !fileType) {
      return NextResponse.json(
        { error: "fileName, content, and fileType are required" },
        { status: 400 }
      );
    }

    const config: LLMConfig | undefined = llmConfig
      ? { provider: llmConfig.provider, model: llmConfig.model, ollamaUrl: llmConfig.ollamaUrl }
      : undefined;

    const result = await runIngest({ fileName, content, fileType }, config);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
