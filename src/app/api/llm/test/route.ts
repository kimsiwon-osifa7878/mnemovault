import { NextResponse } from "next/server";
import { normalizeLLMError } from "@/lib/llm/errors";

type ProbeType = "openrouter_upstream_check" | "ollama_basic_connect";

function classifyOpenRouterFailure(
  status: number,
  responseText: string
): {
  rateLimited: boolean;
  message: string;
  details?: { code?: string; upstreamStatus?: number };
} {
  const lowered = responseText.toLowerCase();
  const rateLimited =
    status === 429 ||
    lowered.includes("temporarily rate-limited upstream") ||
    lowered.includes("rate limit");

  if (rateLimited) {
    return {
      rateLimited: true,
      message: "Rate-limited upstream",
      details: { code: "upstream_rate_limited", upstreamStatus: status },
    };
  }

  if (status === 401 || status === 403) {
    return {
      rateLimited: false,
      message: "Auth failed",
      details: { code: "auth_failed", upstreamStatus: status },
    };
  }

  return {
    rateLimited: false,
    message: "OpenRouter upstream error",
    details: { code: "upstream_http_error", upstreamStatus: status },
  };
}

async function probeOpenRouter(model: string): Promise<{
  status: "ok" | "fail";
  probeType: ProbeType;
  rateLimited: boolean;
  message: string;
  details?: { code?: string; upstreamStatus?: number };
}> {
  const apiKey = process.env.OPENROUTER_API_KEY || "";
  const signal = AbortSignal.timeout(4000);

  console.info("[api/llm/test] probe_started", {
    provider: "openrouter",
    model,
  });

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    signal,
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 1,
      temperature: 0,
    }),
  });

  if (response.ok) {
    console.info("[api/llm/test] probe_succeeded", {
      provider: "openrouter",
      model,
      status: response.status,
    });
    return {
      status: "ok",
      probeType: "openrouter_upstream_check",
      rateLimited: false,
      message: "Connected",
    };
  }

  const responseText = await response.text();
  const classified = classifyOpenRouterFailure(response.status, responseText);
  console.warn("[api/llm/test] probe_failed", {
    provider: "openrouter",
    model,
    status: response.status,
    code: classified.details?.code,
    message: classified.message,
  });

  return {
    status: "fail",
    probeType: "openrouter_upstream_check",
    rateLimited: classified.rateLimited,
    message: classified.message,
    details: classified.details,
  };
}

async function probeOllama(baseUrl: string): Promise<{
  status: "ok" | "fail";
  probeType: ProbeType;
  rateLimited: boolean;
  message: string;
  details?: { code?: string; upstreamStatus?: number };
}> {
  const signal = AbortSignal.timeout(4000);

  console.info("[api/llm/test] probe_started", {
    provider: "ollama",
    baseUrl,
  });

  const response = await fetch(`${baseUrl}/api/tags`, { signal });
  if (response.ok) {
    console.info("[api/llm/test] probe_succeeded", {
      provider: "ollama",
      status: response.status,
    });
    return {
      status: "ok",
      probeType: "ollama_basic_connect",
      rateLimited: false,
      message: "Connected",
    };
  }

  console.warn("[api/llm/test] probe_failed", {
    provider: "ollama",
    status: response.status,
  });
  return {
    status: "fail",
    probeType: "ollama_basic_connect",
    rateLimited: false,
    message: "Cannot connect",
    details: { code: "upstream_http_error", upstreamStatus: response.status },
  };
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  let probeType: ProbeType = "openrouter_upstream_check";

  try {
    const body = await request.json();
    const provider = body.provider === "ollama" ? "ollama" : "openrouter";
    const model = typeof body.model === "string" ? body.model : "";
    const ollamaUrl =
      typeof body.ollamaUrl === "string" ? body.ollamaUrl : "http://localhost:11434";
    probeType =
      provider === "ollama"
        ? "ollama_basic_connect"
        : "openrouter_upstream_check";

    if (!model) {
      return NextResponse.json({
        status: "fail",
        probeType:
          probeType,
          rateLimited: false,
          message: "model is required",
          elapsedMs: Date.now() - startedAt,
      });
    }

    const probeResult =
      provider === "ollama"
        ? await probeOllama(ollamaUrl)
        : await probeOpenRouter(model);

    return NextResponse.json({
      ...probeResult,
      elapsedMs: Date.now() - startedAt,
    });
  } catch (e) {
    const normalized = normalizeLLMError(e);
    const message =
      normalized.code === "network_error"
        ? "Network error"
        : normalized.code === "timeout"
          ? "Network error"
          : "OpenRouter upstream error";
    console.error("[api/llm/test] probe_failed", {
      code: normalized.code,
      message: normalized.message,
      upstreamStatus: normalized.status,
      elapsedMs: Date.now() - startedAt,
    });
    return NextResponse.json({
      status: "fail",
      probeType,
      rateLimited: false,
      message,
      details: {
        code: normalized.code,
        ...(normalized.status ? { upstreamStatus: normalized.status } : {}),
      },
      elapsedMs: Date.now() - startedAt,
    });
  }
}
