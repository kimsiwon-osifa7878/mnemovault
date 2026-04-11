import { afterEach, describe, expect, it } from "vitest";
import type { LLMConfig } from "./client";
import { resolveLLMRequestPolicy } from "./client";

const KEYS = [
  "LLM_REQUEST_TIMEOUT_MS",
  "OLLAMA_REQUEST_TIMEOUT_MS",
  "OPENROUTER_REQUEST_TIMEOUT_MS",
  "LLM_REQUEST_RETRIES",
  "OLLAMA_REQUEST_RETRIES",
  "OPENROUTER_REQUEST_RETRIES",
] as const;

function clearPolicyEnv() {
  for (const key of KEYS) delete process.env[key];
}

function cfg(provider: LLMConfig["provider"]): LLMConfig {
  return provider === "ollama"
    ? { provider, model: "gemma4:e4b", ollamaUrl: "http://localhost:11434" }
    : { provider, model: "openrouter/free" };
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

  it("uses shorter timeout and one retry by default for openrouter", () => {
    const policy = resolveLLMRequestPolicy(cfg("openrouter"));
    expect(policy.timeoutMs).toBe(120_000);
    expect(policy.maxRetries).toBe(1);
  });

  it("allows disabling timeout with 0", () => {
    process.env.OLLAMA_REQUEST_TIMEOUT_MS = "0";
    const policy = resolveLLMRequestPolicy(cfg("ollama"));
    expect(policy.timeoutMs).toBeNull();
  });

  it("global env overrides provider-specific values", () => {
    process.env.LLM_REQUEST_TIMEOUT_MS = "600000";
    process.env.OLLAMA_REQUEST_TIMEOUT_MS = "1000";
    process.env.LLM_REQUEST_RETRIES = "2";
    process.env.OLLAMA_REQUEST_RETRIES = "0";
    const policy = resolveLLMRequestPolicy(cfg("ollama"));
    expect(policy.timeoutMs).toBe(600_000);
    expect(policy.maxRetries).toBe(2);
  });
});
