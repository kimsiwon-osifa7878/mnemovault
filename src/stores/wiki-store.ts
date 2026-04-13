import { create } from "zustand";
import { WikiPage } from "@/types/wiki";
import { createRawWorkspacePage, parseWikiPage } from "@/lib/wiki/parser";
import * as clientFs from "@/lib/storage/client-fs";
import { useStorageStore } from "./storage-store";

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
  openFile: (filePath: string) => Promise<void>;
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
      const root = useStorageStore.getState().contentHandle;
      if (!root) throw new Error("Storage not connected");

      const files = await clientFs.listFiles(root, "wiki");
      const pages: WikiPage[] = [];
      for (const f of files) {
        try {
          const raw = await clientFs.readFile(root, f);
          const filename = f.split("/").pop() || f;
          pages.push(parseWikiPage(filename, raw));
        } catch {
          // skip unreadable files
        }
      }
      set({ pages, isLoading: false });
    } catch (e) {
      set({ error: (e as Error).message, isLoading: false });
    }
  },

  fetchPage: async (slug: string) => {
    set({ isLoading: true, error: null });
    try {
      const root = useStorageStore.getState().contentHandle;
      if (!root) throw new Error("Storage not connected");

      // Search for the file matching this slug
      const files = await clientFs.listFiles(root, "wiki");
      const match = files.find((f) => {
        const filename = f.split("/").pop() || f;
        return filename.replace(/\.md$/, "") === slug;
      });

      if (!match) throw new Error(`Page not found: ${slug}`);

      const raw = await clientFs.readFile(root, match);
      const filename = match.split("/").pop() || match;
      const page = parseWikiPage(filename, raw);
      page.path = match;

      set({ currentPage: page, currentSlug: slug, isLoading: false });
    } catch (e) {
      set({ error: (e as Error).message, isLoading: false });
    }
  },

  openFile: async (filePath: string) => {
    set({ isLoading: true, error: null });
    try {
      const root = useStorageStore.getState().contentHandle;
      if (!root) throw new Error("Storage not connected");

      const raw = await clientFs.readFile(root, filePath);
      const page = createRawWorkspacePage(filePath, raw);
      set({ currentPage: page, currentSlug: page.slug, isLoading: false });
    } catch (e) {
      set({ error: (e as Error).message, isLoading: false });
    }
  },

  savePage: async (slug: string, content: string) => {
    set({ isLoading: true, error: null });
    try {
      const root = useStorageStore.getState().contentHandle;
      if (!root) throw new Error("Storage not connected");

      const currentPage = get().currentPage;
      if (!currentPage?.editable) {
        throw new Error("This file is read-only");
      }

      // Find the existing file path
      const files = await clientFs.listFiles(root, "wiki");
      const match = files.find((f) => {
        const filename = f.split("/").pop() || f;
        return filename.replace(/\.md$/, "") === slug;
      });

      if (!match) throw new Error(`Page not found: ${slug}`);

      await clientFs.writeFile(root, match, content);

      const filename = match.split("/").pop() || match;
      const page = parseWikiPage(filename, content);
      set({ currentPage: page, isLoading: false });

      // Refresh page list
      get().fetchPages();
    } catch (e) {
      set({ error: (e as Error).message, isLoading: false });
    }
  },

  deletePage: async (slug: string) => {
    set({ isLoading: true, error: null });
    try {
      const root = useStorageStore.getState().contentHandle;
      if (!root) throw new Error("Storage not connected");

      const currentPage = get().currentPage;
      if (!currentPage?.editable) {
        throw new Error("This file cannot be deleted here");
      }

      const files = await clientFs.listFiles(root, "wiki");
      const match = files.find((f) => {
        const filename = f.split("/").pop() || f;
        return filename.replace(/\.md$/, "") === slug;
      });

      if (!match) throw new Error(`Page not found: ${slug}`);

      await clientFs.deleteFile(root, match);
      set({ currentPage: null, currentSlug: null, isLoading: false });
      get().fetchPages();
    } catch (e) {
      set({ error: (e as Error).message, isLoading: false });
    }
  },
}));
