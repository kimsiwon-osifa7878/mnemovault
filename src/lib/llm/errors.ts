export type LLMErrorCode =
  | "timeout"
  | "upstream_http_error"
  | "network_error"
  | "invalid_response"
  | "unknown";

interface LLMRequestErrorOptions {
  status?: number;
  retryable?: boolean;
  details?: Record<string, unknown>;
  cause?: unknown;
}

export class LLMRequestError extends Error {
  code: LLMErrorCode;
  status?: number;
  retryable: boolean;
  details?: Record<string, unknown>;

  constructor(code: LLMErrorCode, message: string, options: LLMRequestErrorOptions = {}) {
    super(message);
    this.name = "LLMRequestError";
    this.code = code;
    this.status = options.status;
    this.retryable = options.retryable ?? (code === "timeout" || code === "network_error");
    this.details = options.details;
    if (options.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

function hasMessage(error: unknown): error is { message: string; name?: string } {
  return typeof error === "object" && error !== null && "message" in error;
}

function isTimeoutError(error: unknown): boolean {
  if (!hasMessage(error)) return false;
  const name = (error.name || "").toLowerCase();
  const message = error.message.toLowerCase();
  return (
    name.includes("abort") ||
    name.includes("timeout") ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("headers timeout") ||
    message.includes("und_err_headers_timeout") ||
    message.includes("aborted")
  );
}

function isNetworkError(error: unknown): boolean {
  if (!hasMessage(error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("fetch failed") ||
    message.includes("econnreset") ||
    message.includes("econnrefused") ||
    message.includes("enotfound") ||
    message.includes("eai_again") ||
    message.includes("socket")
  );
}

export function normalizeLLMError(error: unknown): LLMRequestError {
  if (error instanceof LLMRequestError) return error;

  if (isTimeoutError(error)) {
    return new LLMRequestError(
      "timeout",
      "LLM request timed out before the model returned a response.",
      { retryable: true, cause: error }
    );
  }

  if (isNetworkError(error)) {
    return new LLMRequestError(
      "network_error",
      "LLM provider network request failed before completion.",
      { retryable: true, cause: error }
    );
  }

  if (error instanceof Error) {
    return new LLMRequestError("unknown", error.message, { retryable: false, cause: error });
  }

  return new LLMRequestError("unknown", "Unknown LLM error occurred.", {
    retryable: false,
    details: { value: String(error) },
  });
}
