import { create } from "zustand";
import { GraphData } from "@/types/graph";

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
      const res = await fetch("/api/graph");
      if (!res.ok) throw new Error("Failed to fetch graph");
      const data = await res.json();
      set({ graphData: data, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },
}));
