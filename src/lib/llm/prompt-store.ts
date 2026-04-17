import "server-only";

import { readFile } from "fs/promises";
import path from "path";

type Language = "en" | "ko";
type PromptTask = "query" | "ingest" | "lint";
type PromptRole = "system" | "user";

interface PromptFile {
  query: {
    system: Record<Language, string>;
    user: Record<Language, string>;
  };
  ingest: {
    system: Record<Language, string>;
    user: Record<Language, string>;
  };
  lint: {
    system: Record<Language, string>;
  };
}

const PROMPT_PATH = path.join(process.cwd(), "src/lib/llm/prompts.v2.json");
let promptCache: Promise<PromptFile> | null = null;

function assertPromptShape(data: unknown): asserts data is PromptFile {
  const value = data as Partial<PromptFile>;
  const hasLangs = (node: unknown): node is Record<Language, string> =>
    !!node &&
    typeof node === "object" &&
    typeof (node as Record<string, unknown>).en === "string" &&
    typeof (node as Record<string, unknown>).ko === "string";

  if (
    !value ||
    !value.query ||
    !value.ingest ||
    !value.lint ||
    !hasLangs(value.query.system) ||
    !hasLangs(value.query.user) ||
    !hasLangs(value.ingest.system) ||
    !hasLangs(value.ingest.user) ||
    !hasLangs(value.lint.system)
  ) {
    throw new Error(`Invalid prompt file shape: ${PROMPT_PATH}`);
  }
}

async function loadPromptFile(): Promise<PromptFile> {
  const raw = await readFile(PROMPT_PATH, "utf8");
  const parsed = JSON.parse(raw);
  assertPromptShape(parsed);
  return parsed;
}

async function getPromptFile(): Promise<PromptFile> {
  if (!promptCache) {
    promptCache = loadPromptFile();
  }
  return promptCache;
}

export async function getPrompt(
  task: PromptTask,
  role: PromptRole,
  language: Language
): Promise<string> {
  const prompts = await getPromptFile();
  const prompt = prompts[task]?.[role as keyof (typeof prompts)[typeof task]];
  if (!prompt || typeof prompt !== "object" || !(language in prompt)) {
    throw new Error(`Prompt not found for ${task}.${role}.${language}`);
  }

  return prompt[language as keyof typeof prompt] as string;
}

export function renderPrompt(
  template: string,
  variables: Record<string, string>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    if (!(key in variables)) {
      throw new Error(`Missing prompt variable: ${key}`);
    }
    return variables[key];
  });
}
