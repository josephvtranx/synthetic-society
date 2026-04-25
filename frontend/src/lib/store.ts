import { create } from "zustand";
import type { SimState, AgentData } from "./types";

const EMPTY_STATE: SimState = {
  tick: 0,
  agents: [],
  edges: [],
  active_conversations: [],
  recent_events: [],
  stats: { mean_position: 0, std_position: 0, polarization_index: 0, tick: 0 },
  win_progress: 0,
  game_mode: "sandbox",
  is_running: false,
  has_converged: false,
};

type SimStore = {
  state: SimState;
  selectedAgentId: string | null;
  connected: boolean;

  setState: (state: SimState) => void;
  selectAgent: (id: string | null) => void;
  setConnected: (connected: boolean) => void;
};

export const useSimStore = create<SimStore>((set) => ({
  state: EMPTY_STATE,
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
