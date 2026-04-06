import { NextResponse } from "next/server";
import { runIngest } from "@/lib/llm/ingest";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { fileName, content, fileType } = body;

    if (!fileName || !content || !fileType) {
      return NextResponse.json(
        { error: "fileName, content, and fileType are required" },
        { status: 400 }
      );
    }

    const result = await runIngest({ fileName, content, fileType });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
