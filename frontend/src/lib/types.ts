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
  source: "argument" | "direct" | "pressure";
};

export type Conversation = {
  from_id: string;
  to_id: string;
  speaker_message: string;
  listener_response: string;
  speaker_arg_type?: string;
  listener_arg_type?: string;
  edge_trust?: number;
  delta_on_speaker?: number;
  delta_on_listener?: number;
  tick: number;
};

// Snapshot of the sim at one tick
export type TickSnapshot = {
  tick: number;
  agents: AgentData[];
  shifts: AgentShift[];
  conversations: Conversation[];
  n_pairs?: number;
  n_unpaired?: number;
  trust_changes?: { removed: number; added: number };
  edges?: EdgeData[];
};

// Probe results after sim completes
export type ProbeResult = {
  agent_id: string;
  shifted: boolean;
  genuine: boolean;
  probe_question: string;
  probe_answer: string;
};

// Inject result returned by /sim/{id}/inject
export type InjectResult = {
  from_id: string;
  to_id: string;
  speaker_message: string;
  listener_response: string;
  arg_type: string;
  arg_quality: number;
  delta_arg: number;
  delta_peer: number;
  actual_delta: number;
  new_position: number;
  agent: AgentData;
};

// What the player submits
export type PlayerInjection = {
  prompt: string;
  target_agent_ids: string[];
  society_type: "polarized" | "consensus" | "random";
  n_agents: number;
};
