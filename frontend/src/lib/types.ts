// Agent data as returned by the backend per tick
export type AgentData = {
  id: string;
  name: string;
  age?: number;
  position: number; // -1.0 to 1.0
  confidence: number; // 0-1
  openness?: number;
  analytical?: number;
  conformity?: number;
  identity_attachment: number; // 0-1
  x: number;
  y: number;
  groups: string[];
  stance?: string;
};

export type EdgeData = {
  source: string;
  target: string;
  weight: number; // trust, 0-1
};

// Per-tick events

export type AgentShift = {
  agent_id: string;
  delta: number;
  new_position: number;
  source: "direct" | "pressure";
};

export type Propagation = {
  from_id: string;
  to_id: string;
  pressure: number;
  resisted: boolean;
};

export type Conversation = {
  from_id: string;
  to_id: string;
  speaker_message: string;
  listener_response: string;
  shift: number;
  tick: number;
};

// Snapshot of the sim at one tick
export type TickSnapshot = {
  tick: number;
  agents: AgentData[];
  shifts: AgentShift[];
  propagations: Propagation[];
  conversations: Conversation[];
};

// Probe results after sim completes
export type ProbeResult = {
  agent_id: string;
  shifted: boolean;
  genuine: boolean;
  probe_question: string;
  probe_answer: string;
};

// Full timeline returned by backend after sim runs
export type SimTimeline = {
  target_agent_ids: string[];
  edges: EdgeData[];
  ticks: TickSnapshot[];
  conversations: Conversation[];
  probe_results: ProbeResult[];
  summary: {
    total_shifted: number;
    genuine_count: number;
    surface_count: number;
    clusters_reached: number;
  };
};

// What the player submits
export type PlayerInjection = {
  prompt: string;
  target_agent_ids: string[];
  society_type: "polarized" | "consensus" | "random";
  n_agents: number;
};
