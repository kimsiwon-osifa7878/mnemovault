import { describe, expect, it } from "vitest";
import { LLMRequestError, normalizeLLMError } from "./errors";

describe("normalizeLLMError", () => {
  it("maps timeout-style errors to timeout code", () => {
    const err = new Error("Headers Timeout Error: UND_ERR_HEADERS_TIMEOUT");
    const normalized = normalizeLLMError(err);

    expect(normalized.code).toBe("timeout");
    expect(normalized.retryable).toBe(true);
  });

  it("maps network errors to network_error code", () => {
    const err = new TypeError("fetch failed: ECONNRESET");
    const normalized = normalizeLLMError(err);

    expect(normalized.code).toBe("network_error");
    expect(normalized.retryable).toBe(true);
  });

  it("preserves structured LLMRequestError", () => {
    const err = new LLMRequestError("upstream_http_error", "bad gateway", {
      retryable: true,
      status: 502,
    });
    const normalized = normalizeLLMError(err);

    expect(normalized).toBe(err);
    expect(normalized.status).toBe(502);
  });
});
