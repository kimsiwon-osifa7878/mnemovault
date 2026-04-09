"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface LLMSettings {
  provider: "openrouter" | "ollama";
  openrouterModel: string;
  ollamaModel: string;
  ollamaUrl: string;
}

interface LLMState extends LLMSettings {
  setProvider: (provider: "openrouter" | "ollama") => void;
  setOpenRouterModel: (model: string) => void;
  setOllamaModel: (model: string) => void;
  setOllamaUrl: (url: string) => void;
  getConfig: () => { provider: "openrouter" | "ollama"; model: string; ollamaUrl?: string };
}

export const useLLMStore = create<LLMState>()(
  persist(
    (set, get) => ({
      provider: "openrouter",
      openrouterModel: "openrouter/free",
      ollamaModel: "gemma4:e4b",
      ollamaUrl: "http://localhost:11434",

      setProvider: (provider) => set({ provider }),
      setOpenRouterModel: (openrouterModel) => set({ openrouterModel }),
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
          provider: "openrouter" as const,
          model: state.openrouterModel,
        };
      },
    }),
    {
      name: "mnemovault-llm-settings",
      version: 1,
      migrate: (persisted: unknown, version: number) => {
        const state = persisted as Record<string, unknown>;
        if (version === 0 || !version) {
          if (state.provider === "claude") state.provider = "openrouter";
          if (state.claudeModel) {
            state.openrouterModel = "openrouter/free";
            delete state.claudeModel;
          }
        }
        return state as unknown as LLMState;
      },
    }
  )
);
