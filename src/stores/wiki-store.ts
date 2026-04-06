import { create } from "zustand";
import { WikiPage } from "@/types/wiki";

interface WikiState {
  pages: WikiPage[];
  currentSlug: string | null;
  currentPage: WikiPage | null;
  isLoading: boolean;
  error: string | null;
  setPages: (pages: WikiPage[]) => void;
  setCurrentSlug: (slug: string | null) => void;
  setCurrentPage: (page: WikiPage | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  fetchPages: () => Promise<void>;
  fetchPage: (slug: string) => Promise<void>;
  savePage: (slug: string, content: string) => Promise<void>;
  deletePage: (slug: string) => Promise<void>;
}

export const useWikiStore = create<WikiState>((set, get) => ({
  pages: [],
  currentSlug: null,
  currentPage: null,
  isLoading: false,
  error: null,
  setPages: (pages) => set({ pages }),
  setCurrentSlug: (slug) => set({ currentSlug: slug }),
  setCurrentPage: (page) => set({ currentPage: page }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),

  fetchPages: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch("/api/wiki");
      if (!res.ok) throw new Error("Failed to fetch pages");
      const data = await res.json();
      set({ pages: data.pages, isLoading: false });
    } catch (e) {
      set({ error: (e as Error).message, isLoading: false });
    }
  },

  fetchPage: async (slug: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch(`/api/wiki/${slug}`);
      if (!res.ok) throw new Error("Failed to fetch page");
      const data = await res.json();
      set({ currentPage: data.page, currentSlug: slug, isLoading: false });
    } catch (e) {
      set({ error: (e as Error).message, isLoading: false });
    }
  },

  savePage: async (slug: string, content: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch(`/api/wiki/${slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error("Failed to save page");
      const data = await res.json();
      set({ currentPage: data.page, isLoading: false });
      // Refresh page list
      get().fetchPages();
    } catch (e) {
      set({ error: (e as Error).message, isLoading: false });
    }
  },

  deletePage: async (slug: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch(`/api/wiki/${slug}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete page");
      set({ currentPage: null, currentSlug: null, isLoading: false });
      get().fetchPages();
    } catch (e) {
      set({ error: (e as Error).message, isLoading: false });
    }
  },
}));
