import { callLLM, LLMConfig } from "./client";
import { readFile, writeFile, listFiles } from "@/lib/storage/fs";
import { parseWikiPage } from "@/lib/wiki/parser";
import { generateIndexContent } from "@/lib/wiki/index-manager";
import { appendLogEntry } from "@/lib/wiki/log-manager";
import { sha256 } from "@/lib/utils/hash";
import { toSlug } from "@/lib/utils/markdown";
import { IngestRequest, IngestResponse, WikiPage } from "@/types/wiki";

const INGEST_SYSTEM_PROMPT = `당신은 지식 위키 컴파일러입니다. 주어진 raw 소스를 분석하여 아래 JSON 형식으로 응답하세요.

{
  "summary": {
    "title": "소스 제목",
    "content": "마크다운 형식의 상세 요약 (500자 이상)",
    "key_takeaways": ["핵심 포인트 1", "핵심 포인트 2"]
  },
  "concepts": [
    {
      "name": "개념명",
      "content": "개념 설명 마크다운"
    }
  ],
  "entities": [
    {
      "name": "엔티티명",
      "content": "엔티티 설명 마크다운"
    }
  ],
  "wikilinks": ["[[개념A]]", "[[엔티티B]]"],
  "tags": ["태그1", "태그2"]
}

중요 규칙:
- 모든 교차참조는 [[위키링크]] 문법 사용
- 출처를 반드시 명시
- JSON만 출력하세요. 다른 텍스트는 포함하지 마세요.`;

export async function runIngest(req: IngestRequest, llmConfig?: LLMConfig): Promise<IngestResponse> {
  const hash = sha256(req.content);

  // Check if already processed
  let processed: Record<string, string> = {};
  try {
    const raw = await readFile("meta/processed_files.json");
    processed = JSON.parse(raw);
  } catch {
    // file doesn't exist yet
  }

  if (processed[req.fileName] === hash) {
    return { success: true, created: [], updated: [], logEntry: "Already processed" };
  }

  // Call LLM
  const llmResponse = await callLLM(
    INGEST_SYSTEM_PROMPT,
    `파일명: ${req.fileName}\n파일 타입: ${req.fileType}\n\n내용:\n${req.content}`,
    4096,
    llmConfig
  );

  let parsed;
  try {
    const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : llmResponse);
  } catch {
    return { success: false, created: [], updated: [], logEntry: "LLM response parse error" };
  }

  const created: string[] = [];
  const updated: string[] = [];
  const today = new Date().toISOString().split("T")[0];

  // Create source summary page
  const sourceSlug = toSlug(parsed.summary?.title || req.fileName);
  const sourceContent = `---
title: "${parsed.summary?.title || req.fileName}"
type: source
created: ${today}
updated: ${today}
sources:
  - raw/${req.fileType === "paper" ? "papers" : "articles"}/${req.fileName}
tags: ${JSON.stringify(parsed.tags || [])}
confidence: medium
---

# ${parsed.summary?.title || req.fileName}

${parsed.summary?.content || ""}

## 핵심 포인트

${(parsed.summary?.key_takeaways || []).map((t: string) => `- ${t}`).join("\n")}
`;
  await writeFile(`wiki/sources/${sourceSlug}.md`, sourceContent);
  created.push(sourceSlug);

  // Create concept pages
  for (const concept of parsed.concepts || []) {
    const slug = toSlug(concept.name);
    const conceptContent = `---
title: "${concept.name}"
type: concept
created: ${today}
updated: ${today}
sources:
  - raw/${req.fileType === "paper" ? "papers" : "articles"}/${req.fileName}
tags: ${JSON.stringify(parsed.tags || [])}
confidence: medium
---

# ${concept.name}

${concept.content}
`;
    await writeFile(`wiki/concepts/${slug}.md`, conceptContent);
    created.push(slug);
  }

  // Create entity pages
  for (const entity of parsed.entities || []) {
    const slug = toSlug(entity.name);
    const entityContent = `---
title: "${entity.name}"
type: entity
created: ${today}
updated: ${today}
sources:
  - raw/${req.fileType === "paper" ? "papers" : "articles"}/${req.fileName}
tags: ${JSON.stringify(parsed.tags || [])}
confidence: medium
---

# ${entity.name}

${entity.content}
`;
    await writeFile(`wiki/entities/${slug}.md`, entityContent);
    created.push(slug);
  }

  // Save raw file
  const rawDir = req.fileType === "paper" ? "raw/papers" : "raw/articles";
  await writeFile(`${rawDir}/${req.fileName}`, req.content);

  // Update index.md
  const allFiles = await listFiles("wiki");
  const wikiFiles = allFiles.filter(
    (f) => !f.endsWith("index.md") && !f.endsWith("log.md")
  );
  const pages: WikiPage[] = [];
  for (const f of wikiFiles) {
    try {
      const raw = await readFile(f);
      const filename = f.split("/").pop() || f;
      pages.push(parseWikiPage(filename, raw));
    } catch {
      // skip unreadable files
    }
  }
  const indexContent = generateIndexContent(pages);
  await writeFile("wiki/index.md", indexContent);

  // Update log.md
  const logRaw = await readFile("wiki/log.md");
  const newLog = appendLogEntry(logRaw, "ingest", req.fileName, [
    `Created: ${created.map((s) => `[[${s}]]`).join(", ")}`,
    `Index updated: +${created.length} entries`,
  ]);
  await writeFile("wiki/log.md", newLog);

  // Update processed files
  processed[req.fileName] = hash;
  await writeFile("meta/processed_files.json", JSON.stringify(processed, null, 2));

  return {
    success: true,
    created,
    updated,
    logEntry: `Ingested ${req.fileName}: created ${created.length} pages`,
  };
}
