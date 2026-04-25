import type { SimState } from "./types";

// Static mock data so frontend development doesn't block on backend.
// Remove once WebSocket is wired to real backend.

const MOCK_AGENTS = [
  { id: "a1", name: "Marcus Freeman", position: -0.7, confidence: 0.8, influence_score: 0.5, identity_attachment: 0.7, x: 0.15, y: 0.3, target_x: 0.15, target_y: 0.3, current_interaction_partner_id: null, groups: ["middle_aged", "suburban", "trade_educated"], memory: [] },
  { id: "a2", name: "Diane Moreau", position: -0.2, confidence: 0.5, influence_score: 0.6, identity_attachment: 0.3, x: 0.5, y: 0.2, target_x: 0.5, target_y: 0.2, current_interaction_partner_id: null, groups: ["older", "urban", "college_educated"], memory: [] },
  { id: "a3", name: "Tyler Pham", position: -0.4, confidence: 0.3, influence_score: 0.3, identity_attachment: 0.2, x: 0.8, y: 0.6, target_x: 0.8, target_y: 0.6, current_interaction_partner_id: null, groups: ["young", "urban", "college_educated"], memory: [] },
  { id: "a4", name: "Priya Sharma", position: 0.3, confidence: 0.6, influence_score: 0.7, identity_attachment: 0.4, x: 0.3, y: 0.7, target_x: 0.3, target_y: 0.7, current_interaction_partner_id: null, groups: ["middle_aged", "urban", "college_educated"], memory: [] },
  { id: "a5", name: "Carlos Fuentes", position: -0.5, confidence: 0.7, influence_score: 0.4, identity_attachment: 0.6, x: 0.2, y: 0.5, target_x: 0.2, target_y: 0.5, current_interaction_partner_id: null, groups: ["middle_aged", "rural", "trade_educated"], memory: [] },
  { id: "a6", name: "Elena Petrova", position: 0.1, confidence: 0.4, influence_score: 0.5, identity_attachment: 0.3, x: 0.6, y: 0.4, target_x: 0.6, target_y: 0.4, current_interaction_partner_id: null, groups: ["young", "urban", "college_educated"], memory: [] },
  { id: "a7", name: "Kwame Asante", position: -0.6, confidence: 0.6, influence_score: 0.6, identity_attachment: 0.5, x: 0.1, y: 0.8, target_x: 0.1, target_y: 0.8, current_interaction_partner_id: null, groups: ["middle_aged", "suburban", "college_educated"], memory: [] },
  { id: "a8", name: "Sophie Dubois", position: 0.4, confidence: 0.5, influence_score: 0.4, identity_attachment: 0.2, x: 0.7, y: 0.3, target_x: 0.7, target_y: 0.3, current_interaction_partner_id: null, groups: ["young", "urban", "college_educated"], memory: [] },
  { id: "a9", name: "Omar Al-Rashid", position: -0.3, confidence: 0.5, influence_score: 0.5, identity_attachment: 0.4, x: 0.4, y: 0.6, target_x: 0.4, target_y: 0.6, current_interaction_partner_id: null, groups: ["older", "suburban", "self_educated"], memory: [] },
  { id: "a10", name: "Maya Johnson", position: 0.2, confidence: 0.4, influence_score: 0.3, identity_attachment: 0.3, x: 0.9, y: 0.5, target_x: 0.9, target_y: 0.5, current_interaction_partner_id: null, groups: ["young", "urban", "college_educated"], memory: [] },
];

const MOCK_EDGES = [
  // Cluster A: blue-collar (Marcus, Carlos, Kwame)
  { source: "a1", target: "a5", weight: 0.7 },
  { source: "a5", target: "a7", weight: 0.6 },
  { source: "a1", target: "a7", weight: 0.5 },
  // Cluster B: educators (Diane, Omar, Priya)
  { source: "a2", target: "a9", weight: 0.6 },
  { source: "a2", target: "a4", weight: 0.7 },
  { source: "a4", target: "a9", weight: 0.5 },
  // Cluster C: young professionals (Tyler, Elena, Sophie, Maya)
  { source: "a3", target: "a6", weight: 0.6 },
  { source: "a3", target: "a8", weight: 0.5 },
  { source: "a6", target: "a10", weight: 0.6 },
  { source: "a8", target: "a10", weight: 0.5 },
  { source: "a3", target: "a10", weight: 0.4 },
  // Cross-cluster bridges
  { source: "a2", target: "a6", weight: 0.4 }, // Diane -> Elena
  { source: "a4", target: "a1", weight: 0.3 }, // Priya -> Marcus
  { source: "a7", target: "a3", weight: 0.3 }, // Kwame -> Tyler
];

export const MOCK_STATE: SimState = {
  tick: 0,
  agents: MOCK_AGENTS,
  edges: MOCK_EDGES,
  active_conversations: [],
  recent_events: [],
  stats: {
    mean_position: -0.17,
    std_position: 0.38,
    polarization_index: 0.38,
    tick: 0,
  },
  win_progress: 0,
  game_mode: "sandbox",
  is_running: false,
};
