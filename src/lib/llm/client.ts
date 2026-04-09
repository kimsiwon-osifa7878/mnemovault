export interface LLMConfig {
  provider: "openrouter" | "ollama";
  model: string;
  ollamaUrl?: string;
}

const DEFAULT_CONFIG: LLMConfig = {
  provider: "openrouter",
  model: "openrouter/free",
};

function toOpenRouterModelId(model: string): string {
  if (model === "openrouter/free") return model;
  if (model.endsWith(":free")) return model;
  return `${model}:free`;
}

async function callOpenRouter(
  systemPrompt: string,
  userMessage: string,
  model: string,
  maxTokens: number
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY || "";
  const modelId = toOpenRouterModelId(model);

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

async function callOllama(
  systemPrompt: string,
  userMessage: string,
  model: string,
  baseUrl: string,
  maxTokens: number
): Promise<string> {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      stream: false,
      options: {
        num_predict: maxTokens,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Ollama API error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.message?.content || "";
}

export async function callLLM(
  systemPrompt: string,
  userMessage: string,
  maxTokens: number = 4096,
  config?: LLMConfig
): Promise<string> {
  const cfg = config || DEFAULT_CONFIG;

  if (cfg.provider === "ollama") {
    const baseUrl = cfg.ollamaUrl || "http://localhost:11434";
    return callOllama(systemPrompt, userMessage, cfg.model, baseUrl, maxTokens);
  }

  return callOpenRouter(systemPrompt, userMessage, cfg.model, maxTokens);
}
