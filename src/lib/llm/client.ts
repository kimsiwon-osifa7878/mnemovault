import Anthropic from "@anthropic-ai/sdk";

export interface LLMConfig {
  provider: "claude" | "ollama";
  model: string;
  ollamaUrl?: string;
}

const DEFAULT_CONFIG: LLMConfig = {
  provider: "claude",
  model: "claude-sonnet-4-6",
};

let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || "",
    });
  }
  return anthropicClient;
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

async function callAnthropic(
  systemPrompt: string,
  userMessage: string,
  model: string,
  maxTokens: number
): Promise<string> {
  const client = getAnthropicClient();

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock ? textBlock.text : "";
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

  return callAnthropic(systemPrompt, userMessage, cfg.model, maxTokens);
}

// Keep backward compatibility
export async function callClaude(
  systemPrompt: string,
  userMessage: string,
  maxTokens: number = 4096
): Promise<string> {
  return callLLM(systemPrompt, userMessage, maxTokens);
}
