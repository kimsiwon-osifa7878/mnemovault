import { describe, expect, it, vi } from "vitest";
import { extractJsonPayload, processIngestWithLLM } from "./ingest";

vi.mock("./prompt-store", () => ({
  getPrompt: vi.fn(async (scope: string, role: string) => `${scope}-${role}`),
  renderPrompt: vi.fn(() => "user-prompt"),
}));

vi.mock("./client", () => ({
  callLLM: vi.fn(),
}));

import { callLLM } from "./client";

describe("extractJsonPayload", () => {
  it("extracts payload from fenced json blocks", () => {
    const text = 'hello\n```json\n{"summary":{"title":"A"}}\n```\nworld';
    expect(extractJsonPayload(text)).toBe('{"summary":{"title":"A"}}');
  });
});

describe("processIngestWithLLM", () => {
  it("throws invalid_response error when model output is not JSON", async () => {
    vi.mocked(callLLM).mockResolvedValueOnce("not-a-json-response");

    await expect(
      processIngestWithLLM("a.md", "content", "article")
    ).rejects.toMatchObject({
      code: "invalid_response",
    });
  });

  it("parses fenced JSON response correctly", async () => {
    vi.mocked(callLLM).mockResolvedValueOnce(
      '```json\n{"summary":{"title":"T","content":"C","key_takeaways":["k"]},"concepts":[],"entities":[],"tags":[],"updates_to_existing_pages":[],"open_questions":[]}\n```'
    );

    const out = await processIngestWithLLM("a.md", "content", "article");
    expect(out.summary.title).toBe("T");
    expect(out.summary.key_takeaways).toEqual(["k"]);
  });
});
