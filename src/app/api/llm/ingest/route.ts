import { NextResponse } from "next/server";
import { processIngestWithLLM } from "@/lib/llm/ingest";
import { LLMConfig } from "@/lib/llm/client";
import { normalizeLLMError } from "@/lib/llm/errors";

export async function POST(request: Request) {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();
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
    return NextResponse.json({ ...result, requestId });
  } catch (e) {
    const normalized = normalizeLLMError(e);
    const elapsedMs = Date.now() - startedAt;

    const status =
      normalized.code === "timeout"
        ? 504
        : normalized.code === "upstream_http_error" || normalized.code === "network_error"
          ? 502
          : 500;

    console.error("[api/llm/ingest] failed", {
      requestId,
      code: normalized.code,
      message: normalized.message,
      retryable: normalized.retryable,
      upstreamStatus: normalized.status,
      elapsedMs,
    });

    return NextResponse.json(
      {
        requestId,
        code: normalized.code,
        retryable: normalized.retryable,
        elapsedMs,
        error: normalized.message,
        ...(normalized.status ? { upstreamStatus: normalized.status } : {}),
      },
      { status }
    );
  }
}
