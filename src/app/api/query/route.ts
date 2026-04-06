import { NextResponse } from "next/server";
import { runQuery } from "@/lib/llm/query";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { question, currentDocument, fileAsPage } = body;

    if (!question) {
      return NextResponse.json({ error: "question is required" }, { status: 400 });
    }

    const result = await runQuery({ question, currentDocument, fileAsPage });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
