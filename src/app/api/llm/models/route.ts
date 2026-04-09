import { NextResponse } from "next/server";

export async function GET() {
  const raw = process.env.OPENROUTER_FREE_MODELS || "";
  const models = raw
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return NextResponse.json({ models: ["openrouter/free", ...models] });
}
