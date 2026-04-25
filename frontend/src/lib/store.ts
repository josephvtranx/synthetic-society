import { create } from "zustand";
import type { SimState, AgentData } from "./types";
import { MOCK_STATE } from "./mock-data";

type SimStore = {
  // State
  state: SimState;
  selectedAgentId: string | null;
  connected: boolean;

  // Actions
  setState: (state: SimState) => void;
  selectAgent: (id: string | null) => void;
  setConnected: (connected: boolean) => void;
};

export const useSimStore = create<SimStore>((set) => ({
  state: MOCK_STATE,
  selectedAgentId: null,
  connected: false,

  setState: (state) => set({ state }),
  selectAgent: (id) => set({ selectedAgentId: id }),
  setConnected: (connected) => set({ connected }),
}));

// Selectors
export const useAgents = () => useSimStore((s) => s.state.agents);
export const useEdges = () => useSimStore((s) => s.state.edges);
export const useStats = () => useSimStore((s) => s.state.stats);
export const useTick = () => useSimStore((s) => s.state.tick);
export const useIsRunning = () => useSimStore((s) => s.state.is_running);
export const useSelectedAgent = (): AgentData | null => {
  const agents = useSimStore((s) => s.state.agents);
  const id = useSimStore((s) => s.selectedAgentId);
  if (!id) return null;
  return agents.find((a) => a.id === id) ?? null;
};
