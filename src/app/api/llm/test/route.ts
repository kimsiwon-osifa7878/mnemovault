import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { model } = await request.json();
    if (!model) {
      return NextResponse.json({ status: "fail", error: "model is required" });
    }

    const apiKey = process.env.OPENROUTER_API_KEY || "";
    const modelId =
      model === "openrouter/free" || model.endsWith(":free")
        ? model
        : `${model}:free`;

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: modelId,
          messages: [{ role: "user", content: "Hi" }],
          max_tokens: 5,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({ status: "fail", error: errorText });
    }

    const data = await response.json();
    const hasContent = !!data.choices?.[0]?.message?.content;
    return NextResponse.json({ status: hasContent ? "ok" : "fail" });
  } catch (e) {
    return NextResponse.json({
      status: "fail",
      error: (e as Error).message,
    });
  }
}
