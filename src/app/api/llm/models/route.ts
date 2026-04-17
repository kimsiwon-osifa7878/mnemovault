import { NextResponse } from "next/server";

export async function GET() {
  const apiKey = (process.env.OPENROUTER_API_KEY || "").trim();
  const raw = process.env.OPENROUTER_MODELS || "";
  const models = raw
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  const apiKeyConfigured = apiKey.length > 0;
  const modelsConfigured = models.length > 0;
  const openrouterEnabled = apiKeyConfigured && modelsConfigured;

  return NextResponse.json({
    models: openrouterEnabled ? models : [],
    openrouterEnabled,
    missingApiKey: !apiKeyConfigured,
    missingModels: !modelsConfigured,
  });
}
