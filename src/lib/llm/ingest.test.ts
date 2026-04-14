import { describe, expect, it, vi } from "vitest";
import {
  extractJsonPayload,
  parseJsonWithAutoClose,
  processIngestWithLLM,
  processIngestWithLLMStream,
} from "./ingest";

vi.mock("./prompt-store", () => ({
  getPrompt: vi.fn(async (scope: string, role: string) => `${scope}-${role}`),
  renderPrompt: vi.fn(() => "user-prompt"),
}));

vi.mock("./client", () => ({
  callLLM: vi.fn(),
  callLLMStream: vi.fn(),
}));

import { callLLM, callLLMStream } from "./client";

describe("extractJsonPayload", () => {
  it("extracts payload from fenced json blocks", () => {
    const text = 'hello\n```json\n{"summary":{"title":"A"}}\n```\nworld';
    expect(extractJsonPayload(text)).toBe('{"summary":{"title":"A"}}');
  });
});

describe("parseJsonWithAutoClose", () => {
  it("repairs missing closing braces and brackets", () => {
    const parsed = parseJsonWithAutoClose<{ items: Array<{ name: string }> }>(
      '{"items":[{"name":"alpha"}'
    );

    expect(parsed).toEqual({
      items: [{ name: "alpha" }],
    });
  });

  it("still throws when JSON cannot be repaired by adding closers", () => {
    expect(() => parseJsonWithAutoClose('{"items":[,]')).toThrow();
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
      '```json\n{"summary":{"title":"T","content":"C","key_takeaways":["k"]},"concepts":[],"entities":[],"claims":[{"text":"Claim","page_name":"T","evidence_type":"EXTRACTED","confidence":0.9,"source_ref":"a.md :: intro"},{"text":"Skip me","page_name":"T","evidence_type":"INVALID","confidence":0.2,"source_ref":"bad"}],"edges":[{"source_page":"T","target_page":"Concept X","relation":"describes","evidence_type":"INFERRED","confidence":0.65,"source_ref":"a.md :: intro"}],"tags":[],"updates_to_existing_pages":[],"open_questions":[]}\n```'
    );

    const out = await processIngestWithLLM("a.md", "content", "article");
    expect(out.summary.title).toBe("T");
    expect(out.summary.key_takeaways).toEqual(["k"]);
    expect(out.claims).toEqual([
      {
        text: "Claim",
        page_name: "T",
        evidence_type: "EXTRACTED",
        confidence: 0.9,
        source_ref: "a.md :: intro",
      },
    ]);
    expect(out.edges).toEqual([
      {
        source_page: "T",
        target_page: "Concept X",
        relation: "describes",
        evidence_type: "INFERRED",
        confidence: 0.65,
        source_ref: "a.md :: intro",
      },
    ]);
  });

  it("repairs truncated JSON when only closing characters are missing", async () => {
    vi.mocked(callLLM).mockResolvedValueOnce(
      '{"summary":{"title":"T","content":"C","key_takeaways":["k"]},"concepts":[],"entities":[],"tags":[],"updates_to_existing_pages":[],"open_questions":[]'
    );

    const out = await processIngestWithLLM("a.md", "content", "article");
    expect(out.summary.title).toBe("T");
    expect(out.open_questions).toEqual([]);
  });
});

describe("processIngestWithLLMStream", () => {
  it("parses streamed JSON chunks using the same path as compile ingest", async () => {
    vi.mocked(callLLMStream).mockImplementationOnce(async function* () {
      yield { text: '{"summary":{"title":"T","content":"C","key_takeaways":["k"]},' };
      yield {
        text: '"concepts":[],"entities":[],"tags":[],"updates_to_existing_pages":[],"open_questions":[]}',
      };
    });

    const chunks: string[] = [];
    const out = await processIngestWithLLMStream(
      "a.md",
      "content",
      "article",
      undefined,
      "No existing wiki pages yet.",
      "en",
      (chunk) => {
        chunks.push(chunk);
      }
    );

    expect(out.result.summary.title).toBe("T");
    expect(out.chunkCount).toBe(2);
    expect(chunks).toHaveLength(2);
    expect(out.rawResponse).toContain('"summary"');
  });

  it("throws invalid_response when streamed output is not valid JSON", async () => {
    vi.mocked(callLLMStream).mockImplementationOnce(async function* () {
      yield { text: "not-json" };
    });

    await expect(
      processIngestWithLLMStream("a.md", "content", "article")
    ).rejects.toMatchObject({
      code: "invalid_response",
    });
  });
});
