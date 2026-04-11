import { WikiPage } from "@/types/wiki";

export function generateIndexContent(pages: WikiPage[]): string {
  const concepts = pages.filter((p) => p.frontmatter.type === "concept");
  const entities = pages.filter((p) => p.frontmatter.type === "entity");
  const sources = pages.filter((p) => p.frontmatter.type === "source");
  const analyses = pages.filter((p) => p.frontmatter.type === "analysis");

  const formatEntry = (p: WikiPage) => {
    const sourceCount = p.frontmatter.sources?.length || 0;
    return `- [[${p.frontmatter.title}]] — ${p.content.slice(0, 60).replace(/\n/g, " ")}... (sources: ${sourceCount}, updated: ${p.frontmatter.updated})`;
  };

  const content = `---
title: "Wiki Index"
type: index
created: 2026-04-06
updated: ${new Date().toISOString().split("T")[0]}
---

# Wiki Index

## Concepts
${concepts.length > 0 ? concepts.map(formatEntry).join("\n") : "_아직 등록된 개념이 없습니다._"}

## Entities
${entities.length > 0 ? entities.map(formatEntry).join("\n") : "_아직 등록된 엔티티가 없습니다._"}

## Sources
${sources.length > 0 ? sources.map(formatEntry).join("\n") : "_아직 등록된 소스 요약이 없습니다._"}

## Analyses
${analyses.length > 0 ? analyses.map(formatEntry).join("\n") : "_아직 등록된 분석이 없습니다._"}
`;
  return content;
}
