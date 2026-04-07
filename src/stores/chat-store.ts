import { create } from "zustand";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: string[];
  timestamp: Date;
}

interface LLMConfig {
  provider: "claude" | "ollama";
  model: string;
  ollamaUrl?: string;
}

interface ChatState {
  messages: ChatMessage[];
  isLoading: boolean;
  addMessage: (msg: Omit<ChatMessage, "id" | "timestamp">) => void;
  setLoading: (loading: boolean) => void;
  clearMessages: () => void;
  sendQuery: (question: string, currentDocument?: string, fileAsPage?: boolean, llmConfig?: LLMConfig) => Promise<void>;
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

  sendQuery: async (question, currentDocument, fileAsPage, llmConfig) => {
    const { addMessage } = get();
    addMessage({ role: "user", content: question });
    set({ isLoading: true });

    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, currentDocument, fileAsPage, llmConfig }),
      });
      if (!res.ok) throw new Error("Query failed");
      const data = await res.json();
      addMessage({
        role: "assistant",
        content: data.answer,
        citations: data.citations,
      });
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
