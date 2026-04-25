import type { SimTimeline, AgentData, EdgeData } from "./types";

// Generate mock agents in 4 clusters
function makeAgent(
  id: string,
  name: string,
  position: number,
  x: number,
  y: number,
  groups: string[],
  openness: number,
  conformity: number,
  identity_attachment: number,
): AgentData {
  return {
    id,
    name,
    position,
    confidence: 0.4 + Math.random() * 0.4,
    openness,
    conformity,
    identity_attachment,
    x,
    y,
    groups,
  };
}

const INITIAL_AGENTS: AgentData[] = [
  // Cluster A: Blue-collar (top-left, mostly against)
  makeAgent("a1", "Marcus Freeman", -0.7, 0.15, 0.25, ["middle_aged", "suburban", "trade_educated"], 0.3, 0.4, 0.7),
  makeAgent("a2", "Carlos Fuentes", -0.5, 0.1, 0.35, ["middle_aged", "rural", "trade_educated"], 0.4, 0.5, 0.6),
  makeAgent("a3", "Kwame Asante", -0.6, 0.2, 0.4, ["middle_aged", "suburban", "college_educated"], 0.5, 0.3, 0.5),
  makeAgent("a4", "Liam O'Brien", -0.4, 0.25, 0.2, ["young", "suburban", "trade_educated"], 0.5, 0.6, 0.4),
  makeAgent("a5", "Sergei Petrov", -0.8, 0.08, 0.3, ["older", "rural", "trade_educated"], 0.2, 0.3, 0.8),
  makeAgent("a6", "Ramon Cruz", -0.3, 0.18, 0.15, ["middle_aged", "suburban", "self_educated"], 0.6, 0.5, 0.4),
  // Cluster B: Educators (bottom-left, moderate)
  makeAgent("a7", "Diane Moreau", -0.1, 0.15, 0.7, ["older", "urban", "college_educated"], 0.7, 0.3, 0.3),
  makeAgent("a8", "Priya Sharma", 0.2, 0.2, 0.75, ["middle_aged", "urban", "college_educated"], 0.6, 0.4, 0.3),
  makeAgent("a9", "Omar Al-Rashid", -0.15, 0.1, 0.65, ["older", "suburban", "college_educated"], 0.5, 0.4, 0.5),
  makeAgent("a10", "Sunita Rao", 0.1, 0.25, 0.8, ["middle_aged", "urban", "college_educated"], 0.7, 0.3, 0.2),
  makeAgent("a11", "Henrik Dahl", -0.05, 0.08, 0.85, ["older", "urban", "college_educated"], 0.6, 0.3, 0.4),
  makeAgent("a12", "Amina Diallo", 0.15, 0.22, 0.6, ["young", "urban", "college_educated"], 0.8, 0.4, 0.2),
  // Cluster C: Young professionals (right, high conformity)
  makeAgent("a13", "Tyler Pham", -0.3, 0.8, 0.5, ["young", "urban", "college_educated"], 0.6, 0.8, 0.2),
  makeAgent("a14", "Elena Petrova", 0.1, 0.85, 0.55, ["young", "urban", "college_educated"], 0.7, 0.7, 0.2),
  makeAgent("a15", "Sophie Dubois", 0.05, 0.75, 0.45, ["young", "urban", "college_educated"], 0.6, 0.75, 0.15),
  makeAgent("a16", "Maya Johnson", -0.1, 0.9, 0.6, ["young", "urban", "college_educated"], 0.7, 0.7, 0.2),
  makeAgent("a17", "Aiko Suzuki", 0.0, 0.82, 0.4, ["young", "urban", "college_educated"], 0.65, 0.65, 0.25),
  makeAgent("a18", "Ethan Williams", -0.2, 0.78, 0.65, ["young", "suburban", "college_educated"], 0.5, 0.8, 0.2),
  // Cluster D: Small business owners (bottom-right, mixed)
  makeAgent("a19", "Camila Rodriguez", 0.3, 0.7, 0.85, ["middle_aged", "urban", "self_educated"], 0.5, 0.4, 0.5),
  makeAgent("a20", "Marco Rossi", -0.4, 0.75, 0.8, ["middle_aged", "suburban", "self_educated"], 0.4, 0.3, 0.6),
  makeAgent("a21", "Fatou Sow", 0.1, 0.65, 0.9, ["middle_aged", "urban", "college_educated"], 0.6, 0.4, 0.4),
  makeAgent("a22", "Andres Castillo", -0.2, 0.8, 0.9, ["older", "suburban", "self_educated"], 0.3, 0.4, 0.7),
  // Bridge nodes
  makeAgent("a23", "Zoe Levine", 0.0, 0.45, 0.5, ["young", "urban", "college_educated"], 0.8, 0.5, 0.2),
  makeAgent("a24", "Ravi Gupta", -0.1, 0.5, 0.7, ["middle_aged", "urban", "college_educated"], 0.6, 0.4, 0.3),
  makeAgent("a25", "Aroha Tane", 0.05, 0.4, 0.3, ["young", "suburban", "college_educated"], 0.7, 0.5, 0.25),
];

const EDGES: EdgeData[] = [
  // Cluster A internal
  { source: "a1", target: "a2", weight: 0.7 },
  { source: "a1", target: "a3", weight: 0.5 },
  { source: "a2", target: "a3", weight: 0.6 },
  { source: "a1", target: "a4", weight: 0.6 },
  { source: "a4", target: "a6", weight: 0.5 },
  { source: "a5", target: "a1", weight: 0.7 },
  { source: "a5", target: "a2", weight: 0.6 },
  { source: "a3", target: "a6", weight: 0.4 },
  // Cluster B internal
  { source: "a7", target: "a8", weight: 0.7 },
  { source: "a7", target: "a9", weight: 0.6 },
  { source: "a8", target: "a10", weight: 0.6 },
  { source: "a9", target: "a11", weight: 0.5 },
  { source: "a10", target: "a12", weight: 0.6 },
  { source: "a11", target: "a7", weight: 0.5 },
  { source: "a12", target: "a8", weight: 0.5 },
  // Cluster C internal
  { source: "a13", target: "a14", weight: 0.6 },
  { source: "a13", target: "a15", weight: 0.5 },
  { source: "a14", target: "a16", weight: 0.6 },
  { source: "a15", target: "a17", weight: 0.6 },
  { source: "a16", target: "a18", weight: 0.5 },
  { source: "a17", target: "a14", weight: 0.5 },
  { source: "a18", target: "a13", weight: 0.5 },
  // Cluster D internal
  { source: "a19", target: "a20", weight: 0.5 },
  { source: "a19", target: "a21", weight: 0.6 },
  { source: "a20", target: "a22", weight: 0.6 },
  { source: "a21", target: "a22", weight: 0.5 },
  // Cross-cluster bridges
  { source: "a7", target: "a23", weight: 0.5 },  // Diane -> Zoe (B->bridge)
  { source: "a23", target: "a14", weight: 0.5 },  // Zoe -> Elena (bridge->C)
  { source: "a3", target: "a24", weight: 0.4 },   // Kwame -> Ravi (A->bridge)
  { source: "a24", target: "a7", weight: 0.5 },   // Ravi -> Diane (bridge->B)
  { source: "a25", target: "a13", weight: 0.4 },  // Aroha -> Tyler (bridge->C)
  { source: "a12", target: "a25", weight: 0.5 },  // Amina -> Aroha (B->bridge)
  { source: "a19", target: "a24", weight: 0.4 },  // Camila -> Ravi (D->bridge)
  { source: "a23", target: "a19", weight: 0.4 },  // Zoe -> Camila (bridge->D)
  { source: "a6", target: "a20", weight: 0.3 },   // Ramon -> Marco (A->D)
];

// Simulate a cascade: Diane (a7) gets directly persuaded, ripples outward
function generateMockTimeline(): SimTimeline {
  const ticks = [];
  const agents = INITIAL_AGENTS.map((a) => ({ ...a }));

  // Tick 0: initial state (no shifts yet)
  ticks.push({
    tick: 0,
    agents: agents.map((a) => ({ ...a })),
    shifts: [],
    propagations: [],
  });

  // Tick 1: Diane shifts (Phase 1, direct)
  const diane = agents.find((a) => a.id === "a7")!;
  diane.position = 0.35;
  ticks.push({
    tick: 1,
    agents: agents.map((a) => ({ ...a })),
    shifts: [{ agent_id: "a7", delta: 0.45, new_position: 0.35, source: "direct" as const }],
    propagations: [],
  });

  // Tick 2-3: Diane's cluster neighbors feel pressure
  const clusterBShifts = [
    { id: "a8", delta: 0.15, source: "pressure" as const },
    { id: "a9", delta: 0.08, source: "pressure" as const },
  ];
  for (const s of clusterBShifts) {
    const a = agents.find((a) => a.id === s.id)!;
    a.position += s.delta;
  }
  ticks.push({
    tick: 2,
    agents: agents.map((a) => ({ ...a })),
    shifts: clusterBShifts.map((s) => ({
      agent_id: s.id,
      delta: s.delta,
      new_position: agents.find((a) => a.id === s.id)!.position,
      source: s.source,
    })),
    propagations: [
      { from_id: "a7", to_id: "a8", pressure: 0.15, resisted: false },
      { from_id: "a7", to_id: "a9", pressure: 0.08, resisted: false },
      { from_id: "a7", to_id: "a11", pressure: 0.05, resisted: true },
    ],
  });

  // More cluster B + bridge activation
  const tick3Agents = ["a10", "a11", "a12"];
  const tick3Shifts = tick3Agents.map((id) => {
    const delta = 0.05 + Math.random() * 0.1;
    const a = agents.find((a) => a.id === id)!;
    a.position += delta;
    return { agent_id: id, delta, new_position: a.position, source: "pressure" as const };
  });
  ticks.push({
    tick: 3,
    agents: agents.map((a) => ({ ...a })),
    shifts: tick3Shifts,
    propagations: [
      { from_id: "a8", to_id: "a10", pressure: 0.08, resisted: false },
      { from_id: "a9", to_id: "a11", pressure: 0.05, resisted: false },
      { from_id: "a8", to_id: "a12", pressure: 0.07, resisted: false },
    ],
  });

  // Tick 4-5: Bridge nodes carry it to cluster C
  const zoe = agents.find((a) => a.id === "a23")!;
  zoe.position += 0.12;
  const aroha = agents.find((a) => a.id === "a25")!;
  aroha.position += 0.08;
  ticks.push({
    tick: 4,
    agents: agents.map((a) => ({ ...a })),
    shifts: [
      { agent_id: "a23", delta: 0.12, new_position: zoe.position, source: "pressure" as const },
      { agent_id: "a25", delta: 0.08, new_position: aroha.position, source: "pressure" as const },
    ],
    propagations: [
      { from_id: "a7", to_id: "a23", pressure: 0.12, resisted: false },
      { from_id: "a12", to_id: "a25", pressure: 0.08, resisted: false },
    ],
  });

  // Tick 5-6: Tyler and cluster C shift (high conformity = fast)
  const clusterCIds = ["a13", "a14", "a15", "a16", "a17", "a18"];
  const tick5Shifts = clusterCIds.map((id) => {
    const a = agents.find((a) => a.id === id)!;
    const delta = 0.08 + a.conformity! * 0.12;
    a.position += delta;
    return { agent_id: id, delta, new_position: a.position, source: "pressure" as const };
  });
  ticks.push({
    tick: 5,
    agents: agents.map((a) => ({ ...a })),
    shifts: tick5Shifts,
    propagations: clusterCIds.map((id) => ({
      from_id: id === "a13" ? "a25" : id === "a14" ? "a23" : "a13",
      to_id: id,
      pressure: 0.1,
      resisted: false,
    })),
  });

  // Tick 6: Cluster D gets some pressure
  const ravi = agents.find((a) => a.id === "a24")!;
  ravi.position += 0.1;
  const camila = agents.find((a) => a.id === "a19")!;
  camila.position += 0.06;
  ticks.push({
    tick: 6,
    agents: agents.map((a) => ({ ...a })),
    shifts: [
      { agent_id: "a24", delta: 0.1, new_position: ravi.position, source: "pressure" as const },
      { agent_id: "a19", delta: 0.06, new_position: camila.position, source: "pressure" as const },
    ],
    propagations: [
      { from_id: "a7", to_id: "a24", pressure: 0.1, resisted: false },
      { from_id: "a23", to_id: "a19", pressure: 0.06, resisted: false },
      { from_id: "a24", to_id: "a1", pressure: 0.04, resisted: true },
    ],
  });

  // Ticks 7-10: Cluster A resists (Marcus holds firm)
  for (let t = 7; t <= 10; t++) {
    // Small movements in D, A resists
    const fatou = agents.find((a) => a.id === "a21")!;
    if (t === 7) fatou.position += 0.04;
    ticks.push({
      tick: t,
      agents: agents.map((a) => ({ ...a })),
      shifts: t === 7
        ? [{ agent_id: "a21", delta: 0.04, new_position: fatou.position, source: "pressure" as const }]
        : [],
      propagations: [
        { from_id: "a24", to_id: "a1", pressure: 0.03, resisted: true },
        { from_id: "a6", to_id: "a20", pressure: 0.02, resisted: t > 8 },
      ],
    });
  }

  // Ticks 11-20: Settling, minimal movement
  for (let t = 11; t <= 20; t++) {
    ticks.push({
      tick: t,
      agents: agents.map((a) => ({ ...a })),
      shifts: [],
      propagations: [],
    });
  }

  return {
    edges: EDGES,
    ticks,
    probe_results: [
      { agent_id: "a7", shifted: true, genuine: true, probe_question: "Should states with low costs of living set min wages below the federal level?", probe_answer: "No — a federal floor protects workers everywhere. Regional adjustments should only go higher, not lower." },
      { agent_id: "a8", shifted: true, genuine: true, probe_question: "If a small business says they'll lay off workers when min wage rises, what should policy do?", probe_answer: "Provide transition support for small businesses, but the wage floor is about worker dignity." },
      { agent_id: "a13", shifted: true, genuine: false, probe_question: "Should states with low costs of living set min wages below the federal level?", probe_answer: "I mean... maybe? It depends on the local economy I guess. Some places are different." },
      { agent_id: "a14", shifted: true, genuine: false, probe_question: "If a small business says they'll lay off workers when min wage rises, what should policy do?", probe_answer: "That's a tough situation. I can see both sides honestly." },
      { agent_id: "a15", shifted: true, genuine: false, probe_question: "Should tipped workers be exempt from minimum wage increases?", probe_answer: "I'm not really sure. I haven't thought about that specifically." },
      { agent_id: "a9", shifted: true, genuine: true, probe_question: "Should tipped workers be exempt from minimum wage increases?", probe_answer: "No, tipped workers deserve the same baseline protections. The tipping system already creates precarity." },
      { agent_id: "a23", shifted: true, genuine: true, probe_question: "If a small business says they'll lay off workers when min wage rises, what should policy do?", probe_answer: "The data shows most businesses absorb costs through reduced turnover savings. Policy should include phased implementation." },
      { agent_id: "a16", shifted: true, genuine: false, probe_question: "Should states with low costs of living set min wages below the federal level?", probe_answer: "I dunno, everyone around me seems to think it should be uniform, so probably not?" },
      { agent_id: "a1", shifted: false, genuine: false, probe_question: "", probe_answer: "" },
      { agent_id: "a5", shifted: false, genuine: false, probe_question: "", probe_answer: "" },
    ],
    summary: {
      total_shifted: 14,
      genuine_count: 4,
      surface_count: 4,
      clusters_reached: 3,
    },
  };
}

export const MOCK_TIMELINE = generateMockTimeline();
