import { NextResponse } from "next/server";
import { listFiles, readFile, writeFile } from "@/lib/storage/fs";
import { parseWikiPage } from "@/lib/wiki/parser";
import { toSlug } from "@/lib/utils/markdown";

export async function GET() {
  try {
    const files = await listFiles("wiki");
    const pages = [];
    for (const f of files) {
      try {
        const raw = await readFile(f);
        const filename = f.split("/").pop() || f;
        pages.push(parseWikiPage(filename, raw));
      } catch {
        // skip unreadable files
      }
    }
    return NextResponse.json({ pages });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { title, type, content, tags } = body;
    const slug = toSlug(title);
    const today = new Date().toISOString().split("T")[0];

    const typeDir: Record<string, string> = {
      concept: "wiki/concepts",
      entity: "wiki/entities",
      source: "wiki/sources",
      analysis: "wiki/analyses",
    };
    const dir = typeDir[type] || "wiki/concepts";

    const fullContent = `---
title: "${title}"
type: ${type}
created: ${today}
updated: ${today}
tags: ${JSON.stringify(tags || [])}
confidence: medium
---

# ${title}

${content || ""}
`;

    await writeFile(`${dir}/${slug}.md`, fullContent);

    const raw = await readFile(`${dir}/${slug}.md`);
    const page = parseWikiPage(`${slug}.md`, raw);

    return NextResponse.json({ page }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
