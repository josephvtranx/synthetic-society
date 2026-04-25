// Matches backend state snapshot shape from simulation.get_state_snapshot()

export type AgentData = {
  id: string;
  name: string;
  age?: number;
  position: number; // -1.0 to 1.0
  confidence: number; // 0-1
  openness?: number;
  analytical?: number;
  conformity?: number;
  agreeableness?: number;
  influence_score: number; // 0-1
  identity_attachment: number; // 0-1
  x: number;
  y: number;
  target_x: number;
  target_y: number;
  current_interaction_partner_id: string | null;
  groups: string[];
  memory: Array<{ from: string; message: string; tick: number }>;
};

export type EdgeData = {
  source: string;
  target: string;
  weight: number;
};

export type ConversationEvent = {
  agent_a_id: string;
  agent_b_id: string;
  agent_a_name?: string;
  agent_b_name?: string;
  agent_a_statement: string;
  agent_b_statement: string;
  shift_a?: number;
  shift_b?: number;
};

export type SimStats = {
  mean_position: number;
  std_position: number;
  polarization_index: number;
  tick: number;
};

export type SimState = {
  tick: number;
  agents: AgentData[];
  edges: EdgeData[];
  active_conversations: ConversationEvent[];
  recent_events: ConversationEvent[];
  stats: SimStats;
  win_progress: number;
  game_mode: string;
  is_running: boolean;
  has_converged?: boolean;
};
