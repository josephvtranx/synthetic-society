import { create } from "zustand";
import type { AgentData, EdgeData, TickSnapshot, ProbeResult, Conversation, InjectResult } from "./types";

type Screen = "setup" | "playback" | "debrief";

type PlaybackSpeed = 0.5 | 1 | 2;

type SimStore = {
  // App state
  screen: Screen;
  loading: boolean;

  // Session
  simId: string | null;
  topic: string;
  targetAgentIds: string[];
  prompt: string;

  // Incremental timeline
  ticks: TickSnapshot[];
  edges: EdgeData[];
  injectResults: InjectResult[];
  probeResults: ProbeResult[];
  probeSummary: { total_shifted: number; genuine: number; surface: number } | null;

  // Playback state
  currentTick: number;
  playing: boolean;
  speed: PlaybackSpeed;

  // Selection
  selectedAgentId: string | null;

  // Actions
  setScreen: (screen: Screen) => void;
  setLoading: (loading: boolean) => void;
  startSession: (simId: string, topic: string, agents: AgentData[], edges: EdgeData[]) => void;
  addInjectResult: (result: InjectResult, targetId: string) => void;
  addTick: (snapshot: TickSnapshot) => void;
  setProbeResults: (results: ProbeResult[], summary: { total_shifted: number; genuine: number; surface: number }) => void;
  setCurrentTick: (tick: number) => void;
  setPlaying: (playing: boolean) => void;
  setSpeed: (speed: PlaybackSpeed) => void;
  selectAgent: (id: string | null) => void;
  setTargetAgentIds: (ids: string[]) => void;
  setPrompt: (prompt: string) => void;
  reset: () => void;
};

export const useSimStore = create<SimStore>((set) => ({
  screen: "setup",
  loading: false,
  simId: null,
  topic: "",
  targetAgentIds: [],
  prompt: "",
  ticks: [],
  edges: [],
  injectResults: [],
  probeResults: [],
  probeSummary: null,
  currentTick: 0,
  playing: false,
  speed: 1,
  selectedAgentId: null,

  setScreen: (screen) => set({ screen }),
  setLoading: (loading) => set({ loading }),

  startSession: (simId, topic, agents, edges) =>
    set({
      simId,
      topic,
      edges,
      ticks: [{
        tick: 0,
        agents,
        shifts: [],
        conversations: [],
      }],
      currentTick: 0,
      screen: "playback",
      playing: true,
      loading: false,
    }),

  addInjectResult: (result, targetId) =>
    set((state) => {
      const newInjectResults = [...state.injectResults, result];
      const newTargetIds = state.targetAgentIds.includes(targetId)
        ? state.targetAgentIds
        : [...state.targetAgentIds, targetId];

      // Update the current tick's snapshot with the inject result
      const updatedTicks = [...state.ticks];
      const tickIdx = state.currentTick;
      if (tickIdx < updatedTicks.length) {
        const tick = { ...updatedTicks[tickIdx] };
        tick.agents = tick.agents.map((a) =>
          a.id === result.agent.id ? result.agent : a,
        );
        tick.conversations = [
          ...tick.conversations,
          {
            from_id: result.from_id,
            to_id: result.to_id,
            speaker_message: result.speaker_message,
            listener_response: result.listener_response,
            tick: tick.tick,
          },
        ];
        if (Math.abs(result.actual_delta) > 0.001) {
          tick.shifts = [
            ...tick.shifts,
            {
              agent_id: result.to_id,
              delta: result.actual_delta,
              new_position: result.new_position,
              source: "direct",
            },
          ];
        }
        updatedTicks[tickIdx] = tick;
      }

      return {
        injectResults: newInjectResults,
        targetAgentIds: newTargetIds,
        ticks: updatedTicks,
      };
    }),

  addTick: (snapshot) =>
    set((state) => {
      const newTicks = [...state.ticks, snapshot];
      // Update edges if the tick includes them (dynamic trust)
      const newEdges = snapshot.edges ?? state.edges;
      return { ticks: newTicks, edges: newEdges };
    }),

  setProbeResults: (results, summary) =>
    set({ probeResults: results, probeSummary: summary }),

  setCurrentTick: (tick) => set({ currentTick: tick }),
  setPlaying: (playing) => set({ playing }),
  setSpeed: (speed) => set({ speed }),
  selectAgent: (id) => set({ selectedAgentId: id }),
  setTargetAgentIds: (ids) => set({ targetAgentIds: ids }),
  setPrompt: (prompt) => set({ prompt }),
  reset: () =>
    set({
      screen: "setup",
      simId: null,
      topic: "",
      targetAgentIds: [],
      prompt: "",
      ticks: [],
      edges: [],
      injectResults: [],
      probeResults: [],
      probeSummary: null,
      currentTick: 0,
      playing: false,
      selectedAgentId: null,
      loading: false,
    }),
}));

// Selectors
export const useCurrentSnapshot = (): TickSnapshot | null => {
  const ticks = useSimStore((s) => s.ticks);
  const tick = useSimStore((s) => s.currentTick);
  return ticks[tick] ?? null;
};

export const useCurrentAgents = (): AgentData[] => {
  const snapshot = useCurrentSnapshot();
  return snapshot?.agents ?? [];
};

export const useProbeResults = (): ProbeResult[] => {
  return useSimStore((s) => s.probeResults);
};

export const useSelectedAgent = (): AgentData | null => {
  const agents = useCurrentAgents();
  const id = useSimStore((s) => s.selectedAgentId);
  if (!id) return null;
  return agents.find((a) => a.id === id) ?? null;
};

export const useTotalTicks = (): number => {
  const ticks = useSimStore((s) => s.ticks);
  return Math.max(0, ticks.length - 1);
};

export const useCurrentConversations = (): Conversation[] => {
  const snapshot = useCurrentSnapshot();
  return snapshot?.conversations ?? [];
};

export const useAgentConversations = (agentId: string | null): Conversation[] => {
  const ticks = useSimStore((s) => s.ticks);
  const currentTick = useSimStore((s) => s.currentTick);
  if (!agentId) return [];
  const convos: Conversation[] = [];
  for (let t = 0; t <= currentTick && t < ticks.length; t++) {
    for (const c of ticks[t].conversations) {
      if (c.from_id === agentId || c.to_id === agentId) {
        convos.push(c);
      }
    }
  }
  return convos;
};
