import { NextResponse } from "next/server";
import { readFile, writeFile, deleteFile, listFiles } from "@/lib/storage/fs";
import { parseWikiPage } from "@/lib/wiki/parser";

async function findFileBySlug(slug: string): Promise<string | null> {
  const files = await listFiles("wiki");
  for (const f of files) {
    const filename = f.split("/").pop() || "";
    if (filename.replace(/\.md$/, "") === slug) {
      return f;
    }
  }
  return null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const filePath = await findFileBySlug(slug);
    if (!filePath) {
      return NextResponse.json({ error: "Page not found" }, { status: 404 });
    }

    const raw = await readFile(filePath);
    const filename = filePath.split("/").pop() || filePath;
    const page = parseWikiPage(filename, raw);

    // Get backlinks
    const allFiles = await listFiles("wiki");
    const backlinks: string[] = [];
    for (const f of allFiles) {
      if (f === filePath) continue;
      try {
        const content = await readFile(f);
        if (content.includes(`[[${page.frontmatter.title}]]`) || content.includes(`[[${slug}]]`)) {
          const fn = f.split("/").pop() || "";
          backlinks.push(fn.replace(/\.md$/, ""));
        }
      } catch {
        // skip
      }
    }

    return NextResponse.json({ page, backlinks });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const body = await request.json();
    const { content } = body;

    const filePath = await findFileBySlug(slug);
    if (!filePath) {
      return NextResponse.json({ error: "Page not found" }, { status: 404 });
    }

    await writeFile(filePath, content);
    const raw = await readFile(filePath);
    const filename = filePath.split("/").pop() || filePath;
    const page = parseWikiPage(filename, raw);

    return NextResponse.json({ page });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const filePath = await findFileBySlug(slug);
    if (!filePath) {
      return NextResponse.json({ error: "Page not found" }, { status: 404 });
    }

    await deleteFile(filePath);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
