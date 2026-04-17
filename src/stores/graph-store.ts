import { create } from "zustand";
import { GraphData } from "@/types/graph";
import { parseWikiPage, buildGraphData } from "@/lib/wiki/parser";
import * as clientFs from "@/lib/storage/client-fs";
import { useStorageStore } from "./storage-store";

export interface GraphUiState {
  fontSize: number;
  nodeSizeScale: number;
  velocityDecay: number;
  showOperationalNodes: boolean;
  panelSplitRatio: number;
}

interface GraphState {
  graphData: GraphData;
  selectedNode: string | null;
  graphUi: GraphUiState;
  isLoading: boolean;
  setGraphData: (data: GraphData) => void;
  setSelectedNode: (nodeId: string | null) => void;
  setGraphUiPartial: (patch: Partial<GraphUiState>) => void;
  fetchGraph: () => Promise<void>;
}

export const useGraphStore = create<GraphState>((set) => ({
  graphData: { nodes: [], edges: [] },
  selectedNode: null,
  graphUi: {
    fontSize: 10,
    nodeSizeScale: 0.6,
    velocityDecay: 0.38,
    showOperationalNodes: true,
    panelSplitRatio: 0.7,
  },
  isLoading: false,
  setGraphData: (graphData) => set({ graphData }),
  setSelectedNode: (selectedNode) => set({ selectedNode }),
  setGraphUiPartial: (patch) =>
    set((state) => ({ graphUi: { ...state.graphUi, ...patch } })),

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
