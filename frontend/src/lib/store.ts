import { create } from "zustand";
import type { SimTimeline, AgentData, EdgeData, TickSnapshot, ProbeResult } from "./types";

type Screen = "setup" | "playback" | "debrief";

type PlaybackSpeed = 0.5 | 1 | 2;

type SimStore = {
  // App state
  screen: Screen;
  loading: boolean;

  // Timeline (set once after backend returns)
  timeline: SimTimeline | null;
  edges: EdgeData[];

  // Playback state
  currentTick: number;
  playing: boolean;
  speed: PlaybackSpeed;

  // Selection
  selectedAgentId: string | null;

  // Actions
  setScreen: (screen: Screen) => void;
  setLoading: (loading: boolean) => void;
  setTimeline: (timeline: SimTimeline) => void;
  setCurrentTick: (tick: number) => void;
  setPlaying: (playing: boolean) => void;
  setSpeed: (speed: PlaybackSpeed) => void;
  selectAgent: (id: string | null) => void;
  reset: () => void;
};

export const useSimStore = create<SimStore>((set) => ({
  screen: "setup",
  loading: false,
  timeline: null,
  edges: [],
  currentTick: 0,
  playing: false,
  speed: 1,
  selectedAgentId: null,

  setScreen: (screen) => set({ screen }),
  setLoading: (loading) => set({ loading }),
  setTimeline: (timeline) =>
    set({
      timeline,
      edges: timeline.edges,
      currentTick: 0,
      screen: "playback",
      loading: false,
    }),
  setCurrentTick: (tick) => set({ currentTick: tick }),
  setPlaying: (playing) => set({ playing }),
  setSpeed: (speed) => set({ speed }),
  selectAgent: (id) => set({ selectedAgentId: id }),
  reset: () =>
    set({
      screen: "setup",
      timeline: null,
      edges: [],
      currentTick: 0,
      playing: false,
      selectedAgentId: null,
      loading: false,
    }),
}));

// Selectors
export const useCurrentSnapshot = (): TickSnapshot | null => {
  const timeline = useSimStore((s) => s.timeline);
  const tick = useSimStore((s) => s.currentTick);
  if (!timeline) return null;
  return timeline.ticks[tick] ?? null;
};

export const useCurrentAgents = (): AgentData[] => {
  const snapshot = useCurrentSnapshot();
  return snapshot?.agents ?? [];
};

export const useProbeResults = (): ProbeResult[] => {
  const timeline = useSimStore((s) => s.timeline);
  return timeline?.probe_results ?? [];
};

export const useSelectedAgent = (): AgentData | null => {
  const agents = useCurrentAgents();
  const id = useSimStore((s) => s.selectedAgentId);
  if (!id) return null;
  return agents.find((a) => a.id === id) ?? null;
};

export const useTotalTicks = (): number => {
  const timeline = useSimStore((s) => s.timeline);
  return timeline ? timeline.ticks.length - 1 : 0;
};
