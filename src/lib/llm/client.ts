import { Agent, fetch as undiciFetch, type RequestInit as UndiciRequestInit } from "undici";

import { LLMRequestError, normalizeLLMError } from "./errors";

export interface LLMConfig {
  provider: "openrouter" | "ollama";
  model: string;
  ollamaUrl?: string;
  contextTokens?: number;
}

export interface LLMCallOptions {
  requireJson?: boolean;
  temperature?: number;
  think?: boolean;
  signal?: AbortSignal;
}

export interface LLMStreamChunk {
  text: string;
}

type OpenRouterStreamPayload = {
  choices?: Array<{
    delta?: {
      content?: string | Array<{ type?: string; text?: string }>;
      reasoning?: string;
    };
    text?: string;
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
};

const DEFAULT_CONFIG: LLMConfig = {
  provider: "openrouter",
  model: "openrouter/free",
};

const DEFAULT_OPENROUTER_TIMEOUT_MS = 90_000;
const DEFAULT_OLLAMA_TIMEOUT_MS = 900_000; // 15 minutes for slow local models
const DEFAULT_OPENROUTER_RETRIES = 0;
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

function mergeAbortSignals(...signals: Array<AbortSignal | undefined>): AbortSignal | undefined {
  const activeSignals = signals.filter((signal): signal is AbortSignal => !!signal);
  if (activeSignals.length === 0) return undefined;
  if (activeSignals.length === 1) return activeSignals[0];
  return AbortSignal.any(activeSignals);
}

function resolveRequestedTokens(config: LLMConfig | undefined, fallbackMaxTokens: number): number {
  if (!config?.contextTokens || config.contextTokens <= 0) {
    return fallbackMaxTokens;
  }
  return Math.floor(config.contextTokens);
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

async function* readTextLines(
  response: Awaited<ReturnType<typeof undiciFetch>>
): AsyncGenerator<string> {
  if (!response.body) {
    return;
  }

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
      yield line;
    }
  }

  if (buffer) {
    yield buffer;
  }
}

async function* readSseDataLines(
  response: Awaited<ReturnType<typeof undiciFetch>>
): AsyncGenerator<string> {
  let eventData: string[] = [];

  for await (const line of readTextLines(response)) {
    if (!line.trim()) {
      if (eventData.length > 0) {
        yield eventData.join("\n");
        eventData = [];
      }
      continue;
    }

    if (line.startsWith("data:")) {
      eventData.push(line.slice(5).trimStart());
    }
  }

  if (eventData.length > 0) {
    yield eventData.join("\n");
  }
}

async function* readNdjsonLines(
  response: Awaited<ReturnType<typeof undiciFetch>>
): AsyncGenerator<string> {
  for await (const line of readTextLines(response)) {
    const trimmed = line.trim();
    if (trimmed) {
      yield trimmed;
    }
  }
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
  config: LLMConfig,
  maxTokens: number,
  policy: LLMRequestPolicy,
  options?: LLMCallOptions
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY || "";
  const modelId = toOpenRouterModelId(config.model);
  const requestedTokens = resolveRequestedTokens(config, maxTokens);

  return withRetries(policy, async () => {
    const response = await llFetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        signal: mergeAbortSignals(buildTimeoutSignal(policy.timeoutMs), options?.signal),
        body: JSON.stringify({
          model: modelId,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
          ...(options?.requireJson
            ? { response_format: { type: "json_object" } }
            : {}),
          ...(typeof options?.temperature === "number"
            ? { temperature: options.temperature }
            : {}),
          max_tokens: requestedTokens,
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

async function* callOpenRouterStream(
  systemPrompt: string,
  userMessage: string,
  config: LLMConfig,
  maxTokens: number,
  policy: LLMRequestPolicy,
  options?: LLMCallOptions
): AsyncGenerator<LLMStreamChunk> {
  const apiKey = process.env.OPENROUTER_API_KEY || "";
  const modelId = toOpenRouterModelId(config.model);
  const requestedTokens = resolveRequestedTokens(config, maxTokens);

  const response = await llFetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: mergeAbortSignals(buildTimeoutSignal(policy.timeoutMs), options?.signal),
      body: JSON.stringify({
        model: modelId,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        stream: true,
        ...(options?.requireJson
          ? { response_format: { type: "json_object" } }
          : {}),
        ...(typeof options?.temperature === "number"
          ? { temperature: options.temperature }
          : {}),
        max_tokens: requestedTokens,
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

  for await (const dataLine of readSseDataLines(response)) {
    if (dataLine === "[DONE]") {
      break;
    }

    try {
      const payload = JSON.parse(dataLine) as OpenRouterStreamPayload;
      const text = extractOpenRouterStreamText(payload);
      if (typeof text === "string" && text.length > 0) {
        yield { text };
      }
    } catch {
      continue;
    }
  }
}

function normalizeOpenRouterContent(
  value: string | Array<{ type?: string; text?: string }> | undefined
): string {
  if (typeof value === "string") {
    return value;
  }

  if (!Array.isArray(value)) {
    return "";
  }

  return value
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("");
}

function extractOpenRouterStreamText(payload: OpenRouterStreamPayload): string {
  const choice = payload.choices?.[0];
  if (!choice) {
    return "";
  }

  return (
    normalizeOpenRouterContent(choice.delta?.content) ||
    choice.delta?.reasoning ||
    choice.text ||
    normalizeOpenRouterContent(choice.message?.content) ||
    ""
  );
}

async function callOllama(
  systemPrompt: string,
  userMessage: string,
  config: LLMConfig,
  baseUrl: string,
  maxTokens: number,
  policy: LLMRequestPolicy,
  options?: LLMCallOptions
): Promise<string> {
  return withRetries(policy, async () => {
    const response = await llFetch(
      `${baseUrl}/api/chat`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: mergeAbortSignals(buildTimeoutSignal(policy.timeoutMs), options?.signal),
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
          ...(options?.requireJson ? { format: "json" } : {}),
          ...(typeof options?.think === "boolean" ? { think: options.think } : {}),
          stream: false,
          options: {
            ...(config?.contextTokens && config.contextTokens > 0
              ? { num_ctx: Math.floor(config.contextTokens) }
              : {}),
            num_predict: maxTokens,
            ...(typeof options?.temperature === "number"
              ? { temperature: options.temperature }
              : {}),
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

async function* callOllamaStream(
  systemPrompt: string,
  userMessage: string,
  config: LLMConfig,
  baseUrl: string,
  maxTokens: number,
  policy: LLMRequestPolicy,
  options?: LLMCallOptions
): AsyncGenerator<LLMStreamChunk> {
  const response = await llFetch(
    `${baseUrl}/api/chat`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: mergeAbortSignals(buildTimeoutSignal(policy.timeoutMs), options?.signal),
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        ...(options?.requireJson ? { format: "json" } : {}),
        ...(typeof options?.think === "boolean" ? { think: options.think } : {}),
        stream: true,
        options: {
          ...(config?.contextTokens && config.contextTokens > 0
            ? { num_ctx: Math.floor(config.contextTokens) }
            : {}),
          num_predict: maxTokens,
          ...(typeof options?.temperature === "number"
            ? { temperature: options.temperature }
            : {}),
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

  for await (const line of readNdjsonLines(response)) {
    try {
      const payload = JSON.parse(line) as {
        message?: { content?: string };
        done?: boolean;
      };

      const text = payload.message?.content;
      if (typeof text === "string" && text.length > 0) {
        yield { text };
      }

      if (payload.done) {
        break;
      }
    } catch {
      continue;
    }
  }
}

export async function callLLM(
  systemPrompt: string,
  userMessage: string,
  maxTokens: number = 4096,
  config?: LLMConfig,
  options?: LLMCallOptions
): Promise<string> {
  const cfg = config || DEFAULT_CONFIG;
  const policy = resolveLLMRequestPolicy(cfg);

  if (cfg.provider === "ollama") {
    const baseUrl = cfg.ollamaUrl || "http://localhost:11434";
    return callOllama(
      systemPrompt,
      userMessage,
      cfg,
      baseUrl,
      maxTokens,
      policy,
      options
    );
  }

  return callOpenRouter(
    systemPrompt,
    userMessage,
    cfg,
    maxTokens,
    policy,
    options
  );
}

export async function* callLLMStream(
  systemPrompt: string,
  userMessage: string,
  maxTokens: number = 4096,
  config?: LLMConfig,
  options?: LLMCallOptions
): AsyncGenerator<LLMStreamChunk> {
  const cfg = config || DEFAULT_CONFIG;
  const policy = resolveLLMRequestPolicy(cfg);

  if (cfg.provider === "ollama") {
    const baseUrl = cfg.ollamaUrl || "http://localhost:11434";
    yield* callOllamaStream(
      systemPrompt,
      userMessage,
      cfg,
      baseUrl,
      maxTokens,
      policy,
      options
    );
    return;
  }

  yield* callOpenRouterStream(
    systemPrompt,
    userMessage,
    cfg,
    maxTokens,
    policy,
    options
  );
}
