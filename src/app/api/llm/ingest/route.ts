import { NextResponse } from "next/server";
import {
  buildIngestPrompt,
  parseIngestLLMResponse,
  processIngestWithLLM,
} from "@/lib/llm/ingest";
import { callLLMStream, LLMConfig } from "@/lib/llm/client";
import { normalizeLLMError } from "@/lib/llm/errors";

function toSse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function buildDebugPayload(args: {
  requestId: string;
  fileName: string;
  fileType: string;
  content: string;
  wikiContext: string;
  systemPrompt: string;
  userMessage: string;
  llmConfig?: LLMConfig;
}) {
  const {
    requestId,
    fileName,
    fileType,
    content,
    wikiContext,
    systemPrompt,
    userMessage,
    llmConfig,
  } = args;

  return {
    requestId,
    fileName,
    fileType,
    llmConfig: llmConfig || {
      provider: "openrouter",
      model: "openrouter/free",
    },
    requestOptions: {
      stream: true,
      requireJson: true,
      max_tokens: 64000,
      temperature: 0,
    },
    lengths: {
      content: content.length,
      wikiContext: wikiContext.length,
      systemPrompt: systemPrompt.length,
      userMessage: userMessage.length,
    },
    prompts: {
      systemPrompt,
      userMessage,
    },
    previews: {
      content: content.slice(0, 1200),
      wikiContext: wikiContext.slice(0, 1200),
    },
  };
}

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
    const { systemPrompt, userMessage } = await buildIngestPrompt(
      fileName,
      content,
      fileType,
      typeof wikiContext === "string" ? wikiContext : "",
      lang
    );

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let rawResponse = "";

        const write = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(toSse(event, data)));
        };

        try {
          let ingestMode: "stream" | "fallback_non_stream" = "stream";
          write("meta", {
            requestId,
            provider: config?.provider || "openrouter",
            model: config?.model || "openrouter/free",
          });
          write("debug_payload", buildDebugPayload({
            requestId,
            fileName,
            fileType,
            content,
            wikiContext: typeof wikiContext === "string" ? wikiContext : "",
            systemPrompt,
            userMessage,
            llmConfig: config,
          }));
          write("status", { stage: "request_started" });

          for await (const chunk of callLLMStream(
            systemPrompt,
            userMessage,
            2400,
            config,
            {
              requireJson: true,
              temperature: 0,
            }
          )) {
            rawResponse += chunk.text;
            write("chunk", { text: chunk.text });
          }

          write("status", { stage: "parsing_response" });
          let result;
          try {
            result = parseIngestLLMResponse(fileName, rawResponse, config);
          } catch (error) {
            const normalized = normalizeLLMError(error);
            if (normalized.code !== "invalid_response") {
              throw normalized;
            }

            write("status", {
              stage: "fallback_non_stream_json",
              reason: normalized.message,
            });
            result = await processIngestWithLLM(
              fileName,
              content,
              fileType,
              config,
              typeof wikiContext === "string" ? wikiContext : "",
              lang
            );
            ingestMode = "fallback_non_stream";
          }

          write("complete", { ...result, requestId, ingestMode });
        } catch (error) {
          const normalized = normalizeLLMError(error);
          write("error", {
            requestId,
            code: normalized.code,
            retryable: normalized.retryable,
            elapsedMs: Date.now() - startedAt,
            error: normalized.message,
            ...(normalized.status ? { upstreamStatus: normalized.status } : {}),
            ...(rawResponse
              ? { responsePreview: rawResponse.slice(0, 400) }
              : {}),
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
      },
    });
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
