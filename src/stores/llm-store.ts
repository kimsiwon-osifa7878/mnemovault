"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface LLMSettings {
  provider: "claude" | "ollama";
  claudeModel: string;
  ollamaModel: string;
  ollamaUrl: string;
}

interface LLMState extends LLMSettings {
  setProvider: (provider: "claude" | "ollama") => void;
  setClaudeModel: (model: string) => void;
  setOllamaModel: (model: string) => void;
  setOllamaUrl: (url: string) => void;
  getConfig: () => { provider: "claude" | "ollama"; model: string; ollamaUrl?: string };
}

export const useLLMStore = create<LLMState>()(
  persist(
    (set, get) => ({
      provider: "claude",
      claudeModel: "claude-sonnet-4-20250514",
      ollamaModel: "llama3",
      ollamaUrl: "http://localhost:11434",

      setProvider: (provider) => set({ provider }),
      setClaudeModel: (claudeModel) => set({ claudeModel }),
      setOllamaModel: (ollamaModel) => set({ ollamaModel }),
      setOllamaUrl: (ollamaUrl) => set({ ollamaUrl }),

      getConfig: () => {
        const state = get();
        if (state.provider === "ollama") {
          return {
            provider: "ollama" as const,
            model: state.ollamaModel,
            ollamaUrl: state.ollamaUrl,
          };
        }
        return {
          provider: "claude" as const,
          model: state.claudeModel,
        };
      },
    }),
    {
      name: "mnemovault-llm-settings",
    }
  )
);
