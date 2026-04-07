import { create } from "zustand";
import { GraphData } from "@/types/graph";
import { parseWikiPage, buildGraphData } from "@/lib/wiki/parser";
import * as clientFs from "@/lib/storage/client-fs";
import { useStorageStore } from "./storage-store";

interface GraphState {
  graphData: GraphData;
  selectedNode: string | null;
  isLoading: boolean;
  setGraphData: (data: GraphData) => void;
  setSelectedNode: (nodeId: string | null) => void;
  fetchGraph: () => Promise<void>;
}

export const useGraphStore = create<GraphState>((set) => ({
  graphData: { nodes: [], edges: [] },
  selectedNode: null,
  isLoading: false,
  setGraphData: (graphData) => set({ graphData }),
  setSelectedNode: (selectedNode) => set({ selectedNode }),

  fetchGraph: async () => {
    set({ isLoading: true });
    try {
      const root = useStorageStore.getState().contentHandle;
      if (!root) throw new Error("Storage not connected");

      const files = await clientFs.listFiles(root, "wiki");
      const pages = [];
      for (const f of files) {
        try {
          const raw = await clientFs.readFile(root, f);
          const filename = f.split("/").pop() || f;
          pages.push(parseWikiPage(filename, raw));
        } catch {
          // skip
        }
      }

      const graphData = buildGraphData(pages);
      set({ graphData, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },
}));
