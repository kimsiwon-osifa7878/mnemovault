import { create } from "zustand";
import { parseWikiPage, parseWikilinks } from "@/lib/wiki/parser";
import { toSlug } from "@/lib/utils/markdown";
import { appendLogEntry } from "@/lib/wiki/log-manager";
import * as clientFs from "@/lib/storage/client-fs";
import { WikiPage } from "@/types/wiki";
import { useStorageStore } from "./storage-store";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: string[];
  timestamp: Date;
}

interface LLMConfig {
  provider: "openrouter" | "ollama";
  model: string;
  ollamaUrl?: string;
}

interface ChatState {
  messages: ChatMessage[];
  isLoading: boolean;
  addMessage: (msg: Omit<ChatMessage, "id" | "timestamp">) => void;
  setLoading: (loading: boolean) => void;
  clearMessages: () => void;
  sendQuery: (
    question: string,
    currentDocument?: string,
    fileAsPage?: boolean,
    llmConfig?: LLMConfig,
    language?: "en" | "ko"
  ) => Promise<void>;
}

async function buildQueryContext(
  root: FileSystemDirectoryHandle,
  question: string,
  currentDocument?: string
): Promise<string> {
  const files = await clientFs.listFiles(root, "wiki");
  const pages: WikiPage[] = [];
  for (const f of files) {
    try {
      const raw = await clientFs.readFile(root, f);
      const filename = f.split("/").pop() || f;
      pages.push(parseWikiPage(filename, raw));
    } catch {
      // skip
    }
  }

  const tokenize = (text: string): string[] =>
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 2);

  const queryTokens = new Set(tokenize(question));
  const indexPage = pages.find((p) => p.slug === "index");
  const indexLinks = indexPage ? parseWikilinks(indexPage.content).map((link) => toSlug(link.target)) : [];
  const currentPage = currentDocument
    ? pages.find((p) => p.slug === currentDocument)
    : undefined;

  const computeScore = (slug: string, title: string, content: string): number => {
    const haystack = `${title} ${content.slice(0, 1200)}`.toLowerCase();
    let score = 0;

    for (const token of queryTokens) {
      if (title.toLowerCase().includes(token)) score += 8;
      if (haystack.includes(token)) score += 3;
    }

    if (slug === currentDocument) score += 20;
    if (indexLinks.includes(slug)) score += 10;

    return score;
  };

  const rankedPages = pages
    .filter((p) => p.slug !== "index" && p.slug !== "log")
    .map((p) => ({
      page: p,
      score: computeScore(p.slug, p.frontmatter.title, p.content),
    }))
    .sort((a, b) => b.score - a.score);

  let context = "";
  if (indexPage) {
    context += `## Index\n${indexPage.content}\n\n`;
  }

  if (currentPage) {
    context += `## Current Document: ${currentPage.frontmatter.title}\n${currentPage.content}\n\n`;
    const links = parseWikilinks(currentPage.content);
    for (const link of links.slice(0, 5)) {
      const targetSlug = toSlug(link.target);
      const neighborPage = pages.find((p) => p.slug === targetSlug);
      if (neighborPage) {
        context += `## Neighbor: ${neighborPage.frontmatter.title}\n${neighborPage.content}\n\n`;
      }
    }
  }

  const selectedPages = rankedPages
    .filter(({ score }) => score > 0)
    .slice(0, 12)
    .map(({ page }) => page);

  for (const page of selectedPages) {
    context += `## Relevant: ${page.frontmatter.title} (${page.frontmatter.type})\n${page.content.slice(0, 800)}\n\n`;
  }

  if (selectedPages.length === 0) {
    for (const page of rankedPages.slice(0, 8)) {
      context += `## Candidate: ${page.page.frontmatter.title} (${page.page.frontmatter.type})\n${page.page.content.slice(0, 400)}\n\n`;
    }
  }

  return context;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isLoading: false,

  addMessage: (msg) => {
    const message: ChatMessage = {
      ...msg,
      id: crypto.randomUUID(),
      timestamp: new Date(),
    };
    set((state) => ({ messages: [...state.messages, message] }));
  },

  setLoading: (isLoading) => set({ isLoading }),
  clearMessages: () => set({ messages: [] }),

  sendQuery: async (question, currentDocument, fileAsPage, llmConfig, language) => {
    const { addMessage } = get();
    addMessage({ role: "user", content: question });
    set({ isLoading: true });

    try {
      const root = useStorageStore.getState().contentHandle;
      if (!root) throw new Error("Storage not connected");

      // Build context on client
      const context = await buildQueryContext(root, question, currentDocument);

      // Call server for LLM only
      const res = await fetch("/api/llm/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, context, llmConfig, language }),
      });
      if (!res.ok) throw new Error("Query failed");
      const data = await res.json();
      const answer = data.answer;

      // Extract citations
      const answerLinks = parseWikilinks(answer);
      const citations = [...new Set(answerLinks.map((l) => l.target))];

      // Save as wiki page if requested
      if (fileAsPage) {
        const slug = toSlug(question.slice(0, 50));
        const today = new Date().toISOString().split("T")[0];
        const pageContent = `---
title: "${question.slice(0, 80)}"
type: analysis
created: ${today}
updated: ${today}
tags: [query]
confidence: medium
---

# ${question}

${answer}
`;
        await clientFs.writeFile(root, `wiki/analyses/${slug}.md`, pageContent);

        try {
          const logRaw = await clientFs.readFile(root, "wiki/log.md");
          const newLog = appendLogEntry(logRaw, "query", question.slice(0, 50), [
            `Answer filed as: [[${slug}]]`,
            `Referenced: ${citations.map((c) => `[[${c}]]`).join(", ")}`,
          ]);
          await clientFs.writeFile(root, "wiki/log.md", newLog);
        } catch {
          // log update is best-effort
        }
      }

      addMessage({ role: "assistant", content: answer, citations });
    } catch (e) {
      addMessage({
        role: "assistant",
        content: `오류가 발생했습니다: ${(e as Error).message}`,
      });
    } finally {
      set({ isLoading: false });
    }
  },
}));
