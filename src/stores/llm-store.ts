"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_OLLAMA_MODEL, DEFAULT_OLLAMA_URL } from "@/lib/llm/defaults";

export interface LLMSettings {
  provider: "openrouter" | "ollama";
  openrouterModel: string;
  ollamaModel: string;
  ollamaUrl: string;
  language: "en" | "ko";
}

interface LLMState extends LLMSettings {
  setProvider: (provider: "openrouter" | "ollama") => void;
  setOpenRouterModel: (model: string) => void;
  setOllamaModel: (model: string) => void;
  setOllamaUrl: (url: string) => void;
  setLanguage: (language: "en" | "ko") => void;
  getConfig: () => { provider: "openrouter" | "ollama"; model: string; ollamaUrl?: string };
}

export const useLLMStore = create<LLMState>()(
  persist(
    (set, get) => ({
      provider: "openrouter",
      openrouterModel: "openrouter/free",
      ollamaModel: DEFAULT_OLLAMA_MODEL,
      ollamaUrl: DEFAULT_OLLAMA_URL,
      language: "en",

      setProvider: (provider) => set({ provider }),
      setOpenRouterModel: (openrouterModel) => set({ openrouterModel }),
      setOllamaModel: (ollamaModel) => set({ ollamaModel }),
      setOllamaUrl: (ollamaUrl) => set({ ollamaUrl }),
      setLanguage: (language) => set({ language }),

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
      version: 2,
      merge: (persistedState, currentState) => {
        const merged = {
          ...currentState,
          ...(persistedState as Partial<LLMState>),
        };

        // Always prefer .env-backed defaults for Ollama endpoint/model.
        merged.ollamaModel = DEFAULT_OLLAMA_MODEL;
        merged.ollamaUrl = DEFAULT_OLLAMA_URL;

        return merged;
      },
      migrate: (persisted: unknown, version: number) => {
        const state = persisted as Record<string, unknown>;
        if (version === 0 || !version) {
          if (state.provider === "claude") state.provider = "openrouter";
          if (state.claudeModel) {
            state.openrouterModel = "openrouter/free";
            delete state.claudeModel;
          }
        }
        if (version < 2) {
          if (!state.language) state.language = "en";
        }
        return state as unknown as LLMState;
      },
    }
  )
);
