import { NextResponse } from "next/server";
import { processIngestWithLLM } from "@/lib/llm/ingest";
import { LLMConfig } from "@/lib/llm/client";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { fileName, content, fileType, llmConfig, wikiContext, language } = body;

    if (!fileName || !content || !fileType) {
      return NextResponse.json(
        { error: "fileName, content, and fileType are required" },
        { status: 400 }
      );
    }

    const config: LLMConfig | undefined = llmConfig
      ? { provider: llmConfig.provider, model: llmConfig.model, ollamaUrl: llmConfig.ollamaUrl }
      : undefined;

    const lang = (language === "ko" ? "ko" : "en") as "en" | "ko";
    const result = await processIngestWithLLM(
      fileName,
      content,
      fileType,
      config,
      typeof wikiContext === "string" ? wikiContext : "",
      lang
    );
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
