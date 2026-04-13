export const DEFAULT_OLLAMA_MODEL = process.env.NEXT_PUBLIC_OLLAMA_MODEL || "gemma4:e4b";
export const DEFAULT_OLLAMA_URL =
  process.env.NEXT_PUBLIC_OLLAMA_URL ||
  process.env.OLLAMA_URL ||
  "http://localhost:11434";
