import { callLLM, LLMConfig } from "./client";
import { readFile, writeFile, listFiles } from "@/lib/storage/fs";
import { parseWikiPage, parseWikilinks } from "@/lib/wiki/parser";
import { appendLogEntry } from "@/lib/wiki/log-manager";
import { toSlug } from "@/lib/utils/markdown";
import { QueryRequest, QueryResponse, WikiPage } from "@/types/wiki";

const QUERY_SYSTEM_PROMPT = `당신은 위키 기반 지식 어시스턴트입니다.
주어진 위키 컨텍스트를 기반으로 질문에 답변하세요.

규칙:
- 위키에 있는 정보를 기반으로 답변
- 교차참조는 [[위키링크]] 문법 사용
- 출처 페이지를 명시
- 위키에 없는 정보는 명확히 구분하여 표시
- 마크다운 형식으로 답변`;

export async function runQuery(req: QueryRequest, llmConfig?: LLMConfig): Promise<QueryResponse> {
  // Build context from wiki
  const allFiles = await listFiles("wiki");
  const pages: WikiPage[] = [];
  for (const f of allFiles) {
    try {
      const raw = await readFile(f);
      const filename = f.split("/").pop() || f;
      pages.push(parseWikiPage(filename, raw));
    } catch {
      // skip
    }
  }

  // Build context: index + current doc + neighbors
  let context = "";
  const indexPage = pages.find((p) => p.slug === "index");
  if (indexPage) {
    context += `## Index\n${indexPage.content}\n\n`;
  }

  if (req.currentDocument) {
    const currentPage = pages.find((p) => p.slug === req.currentDocument);
    if (currentPage) {
      context += `## Current Document: ${currentPage.frontmatter.title}\n${currentPage.content}\n\n`;
      // Add neighbor pages
      const links = parseWikilinks(currentPage.content);
      for (const link of links.slice(0, 5)) {
        const targetSlug = toSlug(link.target);
        const neighborPage = pages.find((p) => p.slug === targetSlug);
        if (neighborPage) {
          context += `## ${neighborPage.frontmatter.title}\n${neighborPage.content}\n\n`;
        }
      }
    }
  }

  // Add all other pages (trimmed)
  for (const page of pages.slice(0, 20)) {
    if (page.slug === "index" || page.slug === "log") continue;
    context += `## ${page.frontmatter.title} (${page.frontmatter.type})\n${page.content.slice(0, 300)}\n\n`;
  }

  const answer = await callLLM(
    QUERY_SYSTEM_PROMPT,
    `위키 컨텍스트:\n${context}\n\n질문: ${req.question}`,
    4096,
    llmConfig
  );

  // Extract citations
  const answerLinks = parseWikilinks(answer);
  const citations = [...new Set(answerLinks.map((l) => l.target))];

  let savedAs: string | undefined;
  if (req.fileAsPage) {
    const slug = toSlug(req.question.slice(0, 50));
    const today = new Date().toISOString().split("T")[0];
    const pageContent = `---
title: "${req.question.slice(0, 80)}"
type: analysis
created: ${today}
updated: ${today}
tags: [query]
confidence: medium
---

# ${req.question}

${answer}
`;
    await writeFile(`wiki/analyses/${slug}.md`, pageContent);
    savedAs = slug;

    // Update log
    const logRaw = await readFile("wiki/log.md");
    const newLog = appendLogEntry(logRaw, "query", req.question.slice(0, 50), [
      `Answer filed as: [[${slug}]]`,
      `Referenced: ${citations.map((c) => `[[${c}]]`).join(", ")}`,
    ]);
    await writeFile("wiki/log.md", newLog);
  }

  return { answer, citations, savedAs };
}
