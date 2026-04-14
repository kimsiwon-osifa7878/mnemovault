import matter from "gray-matter";
import { WikiPage, WikiLink, Frontmatter } from "@/types/wiki";
import { GraphNode, GraphEdge, GraphData } from "@/types/graph";
import { toSlug } from "@/lib/utils/markdown";
import type { ClaimResult, EdgeResult } from "@/lib/llm/ingest";

const WIKILINK_REGEX = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
const EVIDENCE_BLOCK_REGEX = /```mnemovault-evidence\s*([\s\S]*?)```/gi;

const OPERATIONAL_GRAPH_SLUGS = new Set(["index", "log"]);

export function parseWikilinks(content: string): WikiLink[] {
  const links: WikiLink[] = [];
  let match;
  const regex = new RegExp(WIKILINK_REGEX.source, WIKILINK_REGEX.flags);
  while ((match = regex.exec(content)) !== null) {
    links.push({
      raw: match[0],
      target: match[1].trim(),
      alias: match[2]?.trim(),
      exists: false,
    });
  }
  return links;
}

export function parseWikiPage(filename: string, rawContent: string): WikiPage {
  const { data, content } = matter(rawContent);
  const slug = filename.replace(/\.md$/, "");

  return {
    slug,
    filename,
    path: `wiki/${filename}`,
    editable: true,
    sourceKind: "wiki",
    frontmatter: data as Frontmatter,
    content: content.trim(),
    rawContent,
  };
}

export function createRawWorkspacePage(
  filePath: string,
  rawContent: string
): WikiPage {
  const normalized = filePath.replace(/\\/g, "/");
  const filename = normalized.split("/").pop() || normalized;
  const slug = normalized.replace(/[/.]/g, "-");
  const today = new Date().toISOString().split("T")[0];

  return {
    slug,
    filename,
    path: normalized,
    editable: false,
    sourceKind: normalized.startsWith("meta/") ? "meta" : "wiki",
    frontmatter: {
      title: filename,
      type: "log",
      created: today,
      updated: today,
    },
    content: rawContent,
    rawContent,
  };
}

export function parseEvidenceBlock(rawContent: string): {
  claims: ClaimResult[];
  edges: EdgeResult[];
} {
  const claims: ClaimResult[] = [];
  const edges: EdgeResult[] = [];

  for (const match of rawContent.matchAll(EVIDENCE_BLOCK_REGEX)) {
    if (!match[1]) continue;

    try {
      const parsed = JSON.parse(match[1]) as {
        claims?: ClaimResult[];
        edges?: EdgeResult[];
      };

      if (Array.isArray(parsed.claims)) {
        claims.push(...parsed.claims);
      }

      if (Array.isArray(parsed.edges)) {
        edges.push(...parsed.edges);
      }
    } catch {
      continue;
    }
  }

  return { claims, edges };
}

export function buildGraphData(pages: WikiPage[]): GraphData {
  const graphPages = pages;
  const slugSet = new Set(graphPages.map((p) => p.slug));

  const nodes: GraphNode[] = graphPages.map((p) => ({
    id: p.slug,
    label: p.frontmatter.title || p.slug,
    type: p.frontmatter.type || "concept",
    linkCount: 0,
    isOperational:
      OPERATIONAL_GRAPH_SLUGS.has(p.slug) ||
      p.frontmatter.type === "index" ||
      p.frontmatter.type === "log",
  }));

  const edgeMap = new Map<string, GraphEdge>();

  const upsertEdge = (edge: GraphEdge) => {
    const key = `${edge.source}::${edge.target}`;
    const existing = edgeMap.get(key);
    if (!existing) {
      edgeMap.set(key, edge);
      return;
    }

    edgeMap.set(key, {
      ...existing,
      ...edge,
      relation: edge.relation || existing.relation,
      evidenceType: edge.evidenceType || existing.evidenceType,
      confidence:
        typeof edge.confidence === "number"
          ? edge.confidence
          : existing.confidence,
      sourceRef: edge.sourceRef || existing.sourceRef,
    });
  };

  for (const page of graphPages) {
    const links = parseWikilinks(page.content);
    for (const link of links) {
      const targetSlug = toSlug(link.target);
      if (slugSet.has(targetSlug)) {
        upsertEdge({ source: page.slug, target: targetSlug });
        const sourceNode = nodes.find((n) => n.id === page.slug);
        const targetNode = nodes.find((n) => n.id === targetSlug);
        if (sourceNode) sourceNode.linkCount++;
        if (targetNode) targetNode.linkCount++;
      }
    }

    const evidence = parseEvidenceBlock(page.rawContent);
    for (const edge of evidence.edges) {
      const sourceSlug = toSlug(edge.source_page);
      const targetSlug = toSlug(edge.target_page);
      if (!slugSet.has(sourceSlug) || !slugSet.has(targetSlug)) {
        continue;
      }

      upsertEdge({
        source: sourceSlug,
        target: targetSlug,
        relation: edge.relation,
        evidenceType: edge.evidence_type,
        confidence: edge.confidence,
        sourceRef: edge.source_ref,
      });
    }
  }

  return { nodes, edges: Array.from(edgeMap.values()) };
}

export function getBacklinks(
  targetSlug: string,
  pages: WikiPage[]
): string[] {
  const backlinks: string[] = [];
  for (const page of pages) {
    if (page.slug === targetSlug) continue;
    const links = parseWikilinks(page.content);
    for (const link of links) {
      if (toSlug(link.target) === targetSlug) {
        backlinks.push(page.slug);
        break;
      }
    }
  }
  return backlinks;
}
