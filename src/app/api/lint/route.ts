import { NextResponse } from "next/server";
import { runLint } from "@/lib/llm/lint";

export async function POST() {
  try {
    const result = await runLint();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
