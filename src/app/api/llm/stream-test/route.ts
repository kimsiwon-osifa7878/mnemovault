import { NextResponse } from "next/server";
import { LLMRequestError, normalizeLLMError } from "@/lib/llm/errors";

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

async function readFirstSseChunk(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() || "";

    for (const block of blocks) {
      const lines = block.split(/\r?\n/);
      const dataLines = lines
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart());
      if (dataLines.length === 0) continue;
      const data = dataLines.join("\n");
      if (data === "[DONE]") continue;
      try {
        const payload = JSON.parse(data) as {
          choices?: { delta?: { content?: string } }[];
        };
        const text = payload.choices?.[0]?.delta?.content;
        if (typeof text === "string" && text.length > 0) {
          return text;
        }
      } catch {
        continue;
      }
    }
  }

  return "";
}

async function readFirstNdjsonChunk(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const payload = JSON.parse(trimmed) as {
          message?: { content?: string };
        };
        const text = payload.message?.content;
        if (typeof text === "string" && text.length > 0) {
          return text;
        }
      } catch {
        continue;
      }
    }
  }

  return "";
}

export async function POST(request: Request) {
  const startedAt = Date.now();

  try {
    const body = await request.json();
    const provider = body.provider === "ollama" ? "ollama" : "openrouter";
    const model = typeof body.model === "string" ? body.model : "";
    const ollamaUrl =
      typeof body.ollamaUrl === "string" ? body.ollamaUrl : undefined;

    if (!model) {
      return NextResponse.json({
        status: "fail",
        firstChunkReceived: false,
        message: "model is required",
        elapsedMs: Date.now() - startedAt,
      });
    }

    console.info("[api/llm/stream-test] probe_started", {
      provider,
      model,
    });

    const signal = AbortSignal.timeout(8000);
    let firstChunk = "";

    if (provider === "openrouter") {
      const apiKey = process.env.OPENROUTER_API_KEY || "";
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        signal,
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "Hello" }],
          stream: true,
          max_tokens: 16,
          temperature: 0,
        }),
      });

      if (!response.ok) {
        throw new LLMRequestError(
          "upstream_http_error",
          `OpenRouter API error: ${response.status} ${await response.text()}`,
          {
            status: response.status,
            retryable: response.status === 429 || response.status >= 500,
          }
        );
      }

      firstChunk = await readFirstSseChunk(response);
    } else {
      const baseUrl = ollamaUrl || "http://localhost:11434";
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "Hello" }],
          stream: true,
          options: {
            num_predict: 16,
            temperature: 0,
          },
        }),
      });

      if (!response.ok) {
        throw new LLMRequestError(
          "upstream_http_error",
          `Ollama API error: ${response.status} ${await response.text()}`,
          {
            status: response.status,
            retryable: response.status >= 500,
          }
        );
      }

      firstChunk = await readFirstNdjsonChunk(response);
    }

    if (!firstChunk) {
      return NextResponse.json({
        status: "fail",
        firstChunkReceived: false,
        message: "Stream timeout",
        elapsedMs: Date.now() - startedAt,
      });
    }

    console.info("[api/llm/stream-test] probe_succeeded", {
      provider,
      model,
      preview: firstChunk.slice(0, 40),
    });

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
  } catch (error) {
    const normalized = normalizeLLMError(error);
    const failure = classifyFailure(normalized);
    console.warn("[api/llm/stream-test] probe_failed", {
      code: normalized.code,
      message: normalized.message,
      upstreamStatus: normalized.status,
      elapsedMs: Date.now() - startedAt,
    });
    return NextResponse.json({
      ...failure,
      elapsedMs: Date.now() - startedAt,
    });
  }
}
