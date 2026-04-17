import { afterEach, describe, expect, it } from "vitest";
import type { LLMConfig } from "./client";
import { resolveLLMRequestPolicy } from "./client";
import { DEFAULT_OLLAMA_MODEL } from "./defaults";

const KEYS = [
  "OLLAMA_REQUEST_TIMEOUT_MS",
  "OPENROUTER_REQUEST_TIMEOUT_MS",
  "OLLAMA_REQUEST_RETRIES",
  "OPENROUTER_REQUEST_RETRIES",
] as const;

function clearPolicyEnv() {
  for (const key of KEYS) delete process.env[key];
}

function cfg(provider: LLMConfig["provider"]): LLMConfig {
  return provider === "ollama"
    ? { provider, model: DEFAULT_OLLAMA_MODEL, ollamaUrl: "http://localhost:11434" }
    : { provider, model: "openrouter/auto" };
}

describe("resolveLLMRequestPolicy", () => {
  afterEach(() => {
    clearPolicyEnv();
  });

  it("uses long timeout and no retry by default for ollama", () => {
    const policy = resolveLLMRequestPolicy(cfg("ollama"));
    expect(policy.timeoutMs).toBe(900_000);
    expect(policy.maxRetries).toBe(0);
  });

  it("uses shorter timeout and no retry by default for openrouter", () => {
    const policy = resolveLLMRequestPolicy(cfg("openrouter"));
    expect(policy.timeoutMs).toBe(90_000);
    expect(policy.maxRetries).toBe(0);
  });

  it("allows disabling timeout with 0", () => {
    process.env.OLLAMA_REQUEST_TIMEOUT_MS = "0";
    const policy = resolveLLMRequestPolicy(cfg("ollama"));
    expect(policy.timeoutMs).toBeNull();
  });

  it("uses provider-specific timeout and retries", () => {
    process.env.OLLAMA_REQUEST_TIMEOUT_MS = "1000";
    process.env.OLLAMA_REQUEST_RETRIES = "2";
    const policy = resolveLLMRequestPolicy(cfg("ollama"));
    expect(policy.timeoutMs).toBe(1000);
    expect(policy.maxRetries).toBe(2);
  });
});
