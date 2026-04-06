import { NextResponse } from "next/server";
import { listFiles, readFile } from "@/lib/storage/fs";
import { parseWikiPage, buildGraphData } from "@/lib/wiki/parser";

export async function GET() {
  try {
    const files = await listFiles("wiki");
    const pages = [];
    for (const f of files) {
      try {
        const raw = await readFile(f);
        const filename = f.split("/").pop() || f;
        const page = parseWikiPage(filename, raw);
        // Skip index and log for graph
        if (page.slug !== "index" && page.slug !== "log") {
          pages.push(page);
        }
      } catch {
        // skip
      }
    }

    const graphData = buildGraphData(pages);
    return NextResponse.json(graphData);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
