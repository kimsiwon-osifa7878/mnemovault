"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  DEFAULT_OLLAMA_CONTEXT_TOKENS,
  DEFAULT_OLLAMA_MODEL,
  DEFAULT_OLLAMA_URL,
  DEFAULT_OPENROUTER_CONTEXT_TOKENS,
} from "@/lib/llm/defaults";

export interface LLMSettings {
  provider: "openrouter" | "ollama";
  openrouterModel: string;
  openrouterContextTokens: number;
  ollamaModel: string;
  ollamaUrl: string;
  ollamaContextTokens: number;
  language: "en" | "ko";
  compileLogsEnabled: boolean;
}

interface LLMState extends LLMSettings {
  setProvider: (provider: "openrouter" | "ollama") => void;
  setOpenRouterModel: (model: string) => void;
  setOpenRouterContextTokens: (tokens: number) => void;
  setOllamaModel: (model: string) => void;
  setOllamaUrl: (url: string) => void;
  setOllamaContextTokens: (tokens: number) => void;
  setLanguage: (language: "en" | "ko") => void;
  setCompileLogsEnabled: (enabled: boolean) => void;
  getConfig: () => { provider: "openrouter" | "ollama"; model: string; ollamaUrl?: string; contextTokens?: number };
}

export const useLLMStore = create<LLMState>()(
  persist(
    (set, get) => ({
      provider: "openrouter",
      openrouterModel: "openrouter/free",
      openrouterContextTokens: DEFAULT_OPENROUTER_CONTEXT_TOKENS,
      ollamaModel: DEFAULT_OLLAMA_MODEL,
      ollamaUrl: DEFAULT_OLLAMA_URL,
      ollamaContextTokens: DEFAULT_OLLAMA_CONTEXT_TOKENS,
      language: "en",
      compileLogsEnabled: true,

      setProvider: (provider) => set({ provider }),
      setOpenRouterModel: (openrouterModel) => set({ openrouterModel }),
      setOpenRouterContextTokens: (openrouterContextTokens) => set({ openrouterContextTokens: Math.max(0, Math.floor(openrouterContextTokens)) }),
      setOllamaModel: (ollamaModel) => set({ ollamaModel }),
      setOllamaUrl: (ollamaUrl) => set({ ollamaUrl }),
      setOllamaContextTokens: (ollamaContextTokens) => set({ ollamaContextTokens: Math.max(0, Math.floor(ollamaContextTokens)) }),
      setLanguage: (language) => set({ language }),
      setCompileLogsEnabled: (compileLogsEnabled) => set({ compileLogsEnabled }),

      getConfig: () => {
        const state = get();
        if (state.provider === "ollama") {
          return {
            provider: "ollama" as const,
            model: state.ollamaModel,
            ollamaUrl: state.ollamaUrl,
            ...(state.ollamaContextTokens > 0 ? { contextTokens: state.ollamaContextTokens } : {}),
          };
        }
        return {
          provider: "openrouter" as const,
          model: state.openrouterModel,
          ...(state.openrouterContextTokens > 0 ? { contextTokens: state.openrouterContextTokens } : {}),
        };
      },
    }),
    {
      name: "mnemovault-llm-settings",
      version: 4,
      merge: (persistedState, currentState) => {
        const merged = {
          ...currentState,
          ...(persistedState as Partial<LLMState>),
        };

        // Always prefer .env-backed defaults for Ollama endpoint/model.
        merged.ollamaModel = DEFAULT_OLLAMA_MODEL;
        merged.ollamaUrl = DEFAULT_OLLAMA_URL;
        merged.openrouterContextTokens =
          typeof merged.openrouterContextTokens === "number"
            ? merged.openrouterContextTokens
            : DEFAULT_OPENROUTER_CONTEXT_TOKENS;
        merged.ollamaContextTokens =
          typeof merged.ollamaContextTokens === "number"
            ? merged.ollamaContextTokens
            : DEFAULT_OLLAMA_CONTEXT_TOKENS;

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
        if (version < 3) {
          if (typeof state.compileLogsEnabled !== "boolean") {
            state.compileLogsEnabled = true;
          }
        }
        if (version < 4) {
          if (typeof state.openrouterContextTokens !== "number") {
            state.openrouterContextTokens = DEFAULT_OPENROUTER_CONTEXT_TOKENS;
          }
          if (typeof state.ollamaContextTokens !== "number") {
            state.ollamaContextTokens = DEFAULT_OLLAMA_CONTEXT_TOKENS;
          }
        }
        return state as unknown as LLMState;
      },
    }
  )
);
