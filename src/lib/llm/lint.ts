import { callLLM, LLMConfig } from "./client";
import { readFile, listFiles } from "@/lib/storage/fs";
import { parseWikiPage, parseWikilinks } from "@/lib/wiki/parser";
import { toSlug } from "@/lib/utils/markdown";
import { LintIssue, LintResponse, WikiPage } from "@/types/wiki";

export async function runLint(llmConfig?: LLMConfig): Promise<LintResponse> {
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

  const slugSet = new Set(pages.map((p) => p.slug));
  const issues: LintIssue[] = [];

  // Check for orphan pages (no inbound links)
  const inboundLinks = new Map<string, string[]>();
  for (const page of pages) {
    const links = parseWikilinks(page.content);
    for (const link of links) {
      const targetSlug = toSlug(link.target);
      if (!inboundLinks.has(targetSlug)) {
        inboundLinks.set(targetSlug, []);
      }
      inboundLinks.get(targetSlug)!.push(page.slug);
    }
  }

  for (const page of pages) {
    if (page.slug === "index" || page.slug === "log") continue;
    if (!inboundLinks.has(page.slug) || inboundLinks.get(page.slug)!.length === 0) {
      issues.push({
        type: "orphan",
        description: `"${page.frontmatter.title}" has no inbound links`,
        pages: [page.slug],
        suggestion: "Add references from related pages or index",
      });
    }
  }

  // Check for missing pages (links to non-existent pages)
  for (const page of pages) {
    const links = parseWikilinks(page.content);
    for (const link of links) {
      const targetSlug = toSlug(link.target);
      if (!slugSet.has(targetSlug)) {
        issues.push({
          type: "missing_page",
          description: `"${page.frontmatter.title}" links to non-existent page "[[${link.target}]]"`,
          pages: [page.slug],
          suggestion: `Create page "${link.target}" or fix the link`,
        });
      }
    }
  }

  // Use LLM for contradiction detection if there are enough pages
  if (pages.length >= 3) {
    try {
      const summaries = pages
        .filter((p) => p.slug !== "index" && p.slug !== "log")
        .slice(0, 20)
        .map((p) => `### ${p.frontmatter.title}\n${p.content.slice(0, 200)}`)
        .join("\n\n");

      const llmResponse = await callLLM(
        `위키 페이지들을 분석하여 모순이나 불일치를 찾으세요. JSON 배열로 응답: [{"description": "모순 설명", "pages": ["page1", "page2"]}]. 모순이 없으면 빈 배열 [] 을 반환하세요.`,
        summaries,
        2048,
        llmConfig
      );

      const jsonMatch = llmResponse.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const contradictions = JSON.parse(jsonMatch[0]);
        for (const c of contradictions) {
          issues.push({
            type: "contradiction",
            description: c.description,
            pages: c.pages || [],
            suggestion: "Review and resolve the contradiction",
          });
        }
      }
    } catch {
      // LLM lint is best-effort
    }
  }

  return { issues, autoFixed: 0 };
}
