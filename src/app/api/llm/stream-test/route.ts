import { NextResponse } from "next/server";
import { callLLMStream, type LLMConfig } from "@/lib/llm/client";
import { normalizeLLMError } from "@/lib/llm/errors";

function classifyFailure(error: ReturnType<typeof normalizeLLMError>) {
  const details = {
    code: error.code,
    ...(error.status ? { upstreamStatus: error.status } : {}),
  };

  if (
    error.status === 429 ||
    error.message.toLowerCase().includes("temporarily rate-limited upstream")
  ) {
    return {
      status: "fail" as const,
      firstChunkReceived: false,
      rateLimited: true,
      message: "Rate-limited upstream",
      details,
    };
  }

  if (error.status === 401 || error.status === 403) {
    return {
      status: "fail" as const,
      firstChunkReceived: false,
      rateLimited: false,
      message: "Auth failed",
      details,
    };
  }

  if (error.code === "timeout") {
    return {
      status: "fail" as const,
      firstChunkReceived: false,
      rateLimited: false,
      message: "Stream timeout",
      details,
    };
  }

  if (error.code === "network_error") {
    return {
      status: "fail" as const,
      firstChunkReceived: false,
      rateLimited: false,
      message: "Network error",
      details,
    };
  }

  return {
    status: "fail" as const,
    firstChunkReceived: false,
    rateLimited: false,
    message: "Stream test failed",
    details,
  };
}

function toSse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function createConfig(body: Record<string, unknown>): LLMConfig | null {
  const provider = body.provider === "ollama" ? "ollama" : "openrouter";
  const model = typeof body.model === "string" ? body.model : "";
  const ollamaUrl =
    typeof body.ollamaUrl === "string" ? body.ollamaUrl : undefined;

  if (!model) {
    return null;
  }

  return provider === "ollama"
    ? { provider, model, ollamaUrl }
    : { provider, model };
}

function createPrompt(prompt: string): { systemPrompt: string; userPrompt: string } {
  return {
    systemPrompt:
      "You are running a streaming latency benchmark. Respond plainly and do not use markdown fences.",
    userPrompt:
      prompt.trim() ||
      "Write 12 short numbered lines about streaming performance, each line 10 to 20 words.",
  };
}

async function runProbe(config: LLMConfig) {
  const startedAt = Date.now();
  let firstChunk = "";

  for await (const chunk of callLLMStream(
    "You are a concise assistant.",
    "Reply with a short greeting.",
    32,
    config,
    { temperature: 0 }
  )) {
    if (chunk.text) {
      firstChunk = chunk.text;
      break;
    }
  }

  if (!firstChunk) {
    return NextResponse.json({
      status: "fail",
      firstChunkReceived: false,
      message: "Stream timeout",
      elapsedMs: Date.now() - startedAt,
    });
  }

  return NextResponse.json({
    status: "ok",
    firstChunkReceived: true,
    rateLimited: false,
    message: "Stream OK",
    elapsedMs: Date.now() - startedAt,
    details: {
      preview: firstChunk.slice(0, 80),
    },
  });
}

function runBenchmark(config: LLMConfig, prompt: string, maxTokens: number) {
  const startedAt = Date.now();
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream({
      async start(controller) {
        let chunkCount = 0;
        let charCount = 0;
        let firstChunkElapsedMs: number | null = null;
        let preview = "";

        const write = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(toSse(event, data)));
        };

        try {
          const { systemPrompt, userPrompt } = createPrompt(prompt);
          write("meta", {
            provider: config.provider,
            model: config.model,
            maxTokens,
            promptPreview: userPrompt.slice(0, 120),
          });

          for await (const chunk of callLLMStream(
            systemPrompt,
            userPrompt,
            maxTokens,
            config,
            { temperature: 0.2 }
          )) {
            const text = chunk.text;
            if (!text) continue;

            chunkCount += 1;
            charCount += text.length;
            preview = `${preview}${text}`.slice(-1200);

            const elapsedMs = Date.now() - startedAt;
            if (firstChunkElapsedMs === null) {
              firstChunkElapsedMs = elapsedMs;
            }

            write("chunk", {
              text,
              chunkCount,
              charCount,
              elapsedMs,
            });
          }

          const elapsedMs = Date.now() - startedAt;
          write("complete", {
            elapsedMs,
            chunkCount,
            charCount,
            firstChunkElapsedMs,
            preview,
          });
        } catch (error) {
          const normalized = normalizeLLMError(error);
          write("error", {
            elapsedMs: Date.now() - startedAt,
            code: normalized.code,
            retryable: normalized.retryable,
            error: normalized.message,
            ...(normalized.status ? { upstreamStatus: normalized.status } : {}),
          });
        } finally {
          controller.close();
        }
      },
    }),
    {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    }
  );
}

export async function POST(request: Request) {
  const startedAt = Date.now();

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const mode = body.mode === "stream" ? "stream" : "probe";
    const config = createConfig(body);

    if (!config) {
      return NextResponse.json({
        status: "fail",
        firstChunkReceived: false,
        message: "model is required",
        elapsedMs: Date.now() - startedAt,
      });
    }

    if (mode === "stream") {
      const prompt =
        typeof body.prompt === "string" ? body.prompt : "";
      const maxTokensRaw =
        typeof body.maxTokens === "number" ? body.maxTokens : 192;
      const maxTokens = Math.max(32, Math.min(1024, Math.floor(maxTokensRaw)));
      return runBenchmark(config, prompt, maxTokens);
    }

    return runProbe(config);
  } catch (error) {
    const normalized = normalizeLLMError(error);
    const failure = classifyFailure(normalized);
    return NextResponse.json({
      ...failure,
      elapsedMs: Date.now() - startedAt,
    });
  }
}
