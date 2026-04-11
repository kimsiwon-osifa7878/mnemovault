import { Agent, fetch as undiciFetch, type RequestInit as UndiciRequestInit } from "undici";

import { LLMRequestError, normalizeLLMError } from "./errors";

export interface LLMConfig {
  provider: "openrouter" | "ollama";
  model: string;
  ollamaUrl?: string;
}

const DEFAULT_CONFIG: LLMConfig = {
  provider: "openrouter",
  model: "openrouter/free",
};

const DEFAULT_OPENROUTER_TIMEOUT_MS = 120_000;
const DEFAULT_OLLAMA_TIMEOUT_MS = 900_000; // 15 minutes for slow local models
const DEFAULT_OPENROUTER_RETRIES = 1;
const DEFAULT_OLLAMA_RETRIES = 0;

export interface LLMRequestPolicy {
  timeoutMs: number | null;
  maxRetries: number;
}

function toOpenRouterModelId(model: string): string {
  return model;
}

function parseEnvInt(name: string): number | undefined {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.floor(parsed);
}

export function resolveLLMRequestPolicy(config?: LLMConfig): LLMRequestPolicy {
  const provider = config?.provider || DEFAULT_CONFIG.provider;

  const globalTimeout = parseEnvInt("LLM_REQUEST_TIMEOUT_MS");
  const providerTimeout = parseEnvInt(
    provider === "ollama" ? "OLLAMA_REQUEST_TIMEOUT_MS" : "OPENROUTER_REQUEST_TIMEOUT_MS"
  );
  const timeoutCandidate =
    globalTimeout ??
    providerTimeout ??
    (provider === "ollama" ? DEFAULT_OLLAMA_TIMEOUT_MS : DEFAULT_OPENROUTER_TIMEOUT_MS);
  const timeoutMs = timeoutCandidate <= 0 ? null : timeoutCandidate;

  const globalRetries = parseEnvInt("LLM_REQUEST_RETRIES");
  const providerRetries = parseEnvInt(
    provider === "ollama" ? "OLLAMA_REQUEST_RETRIES" : "OPENROUTER_REQUEST_RETRIES"
  );
  const retryCandidate =
    globalRetries ??
    providerRetries ??
    (provider === "ollama" ? DEFAULT_OLLAMA_RETRIES : DEFAULT_OPENROUTER_RETRIES);
  const maxRetries = Math.max(0, retryCandidate);

  return { timeoutMs, maxRetries };
}

function buildTimeoutSignal(timeoutMs: number | null): AbortSignal | undefined {
  if (timeoutMs === null) return undefined;
  return AbortSignal.timeout(timeoutMs);
}

/** Undici defaults headersTimeout/bodyTimeout to 300s; Ollama often sends headers only after generation completes. */
const dispatcherCache = new Map<string, Agent>();

function getUndiciAgent(policy: LLMRequestPolicy): Agent {
  const key = String(policy.timeoutMs ?? "none");
  let agent = dispatcherCache.get(key);
  if (!agent) {
    const headersTimeout = policy.timeoutMs === null ? 0 : policy.timeoutMs;
    const bodyTimeout = policy.timeoutMs === null ? 0 : policy.timeoutMs;
    agent = new Agent({
      connect: { timeout: 120_000 },
      headersTimeout,
      bodyTimeout,
    });
    dispatcherCache.set(key, agent);
  }
  return agent;
}

async function llFetch(
  input: string,
  init: UndiciRequestInit,
  policy: LLMRequestPolicy
): Promise<Awaited<ReturnType<typeof undiciFetch>>> {
  return undiciFetch(input, {
    ...init,
    dispatcher: getUndiciAgent(policy),
  });
}

async function withRetries<T>(
  policy: LLMRequestPolicy,
  operation: (attempt: number) => Promise<T>
): Promise<T> {
  const maxRetries = policy.maxRetries;
  let lastError: LLMRequestError | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation(attempt);
    } catch (error) {
      const normalized = normalizeLLMError(error);
      lastError = normalized;
      const shouldRetry = normalized.retryable && attempt < maxRetries;
      if (!shouldRetry) break;
    }
  }

  throw lastError || new LLMRequestError("unknown", "Unknown LLM failure");
}

async function callOpenRouter(
  systemPrompt: string,
  userMessage: string,
  model: string,
  maxTokens: number,
  policy: LLMRequestPolicy
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY || "";
  const modelId = toOpenRouterModelId(model);

  return withRetries(policy, async () => {
    const response = await llFetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        signal: buildTimeoutSignal(policy.timeoutMs),
        body: JSON.stringify({
          model: modelId,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
          max_tokens: maxTokens,
        }),
      },
      policy
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new LLMRequestError(
        "upstream_http_error",
        `OpenRouter API error: ${response.status} ${errorText}`,
        {
          status: response.status,
          retryable: response.status === 429 || response.status >= 500,
        }
      );
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return data.choices?.[0]?.message?.content || "";
  });
}

async function callOllama(
  systemPrompt: string,
  userMessage: string,
  model: string,
  baseUrl: string,
  maxTokens: number,
  policy: LLMRequestPolicy
): Promise<string> {
  return withRetries(policy, async () => {
    const response = await llFetch(
      `${baseUrl}/api/chat`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: buildTimeoutSignal(policy.timeoutMs),
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
          stream: false,
          options: {
            num_predict: maxTokens,
          },
        }),
      },
      policy
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new LLMRequestError(
        "upstream_http_error",
        `Ollama API error: ${response.status} ${errorText}`,
        {
          status: response.status,
          retryable: response.status >= 500,
        }
      );
    }

    const data = (await response.json()) as { message?: { content?: string } };
    return data.message?.content || "";
  });
}

export async function callLLM(
  systemPrompt: string,
  userMessage: string,
  maxTokens: number = 4096,
  config?: LLMConfig
): Promise<string> {
  const cfg = config || DEFAULT_CONFIG;
  const policy = resolveLLMRequestPolicy(cfg);

  if (cfg.provider === "ollama") {
    const baseUrl = cfg.ollamaUrl || "http://localhost:11434";
    return callOllama(systemPrompt, userMessage, cfg.model, baseUrl, maxTokens, policy);
  }

  return callOpenRouter(systemPrompt, userMessage, cfg.model, maxTokens, policy);
}
