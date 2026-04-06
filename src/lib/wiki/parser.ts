import matter from "gray-matter";
import { WikiPage, WikiLink, Frontmatter } from "@/types/wiki";
import { GraphNode, GraphEdge, GraphData } from "@/types/graph";
import { toSlug } from "@/lib/utils/markdown";

const WIKILINK_REGEX = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

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
    frontmatter: data as Frontmatter,
    content: content.trim(),
    rawContent,
  };
}

export function buildGraphData(pages: WikiPage[]): GraphData {
  const slugSet = new Set(pages.map((p) => p.slug));

  const nodes: GraphNode[] = pages.map((p) => ({
    id: p.slug,
    label: p.frontmatter.title || p.slug,
    type: p.frontmatter.type || "concept",
    linkCount: 0,
  }));

  const edges: GraphEdge[] = [];

  for (const page of pages) {
    const links = parseWikilinks(page.content);
    for (const link of links) {
      const targetSlug = toSlug(link.target);
      if (slugSet.has(targetSlug)) {
        edges.push({ source: page.slug, target: targetSlug });
        const sourceNode = nodes.find((n) => n.id === page.slug);
        const targetNode = nodes.find((n) => n.id === targetSlug);
        if (sourceNode) sourceNode.linkCount++;
        if (targetNode) targetNode.linkCount++;
      }
    }
  }

  return { nodes, edges };
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
