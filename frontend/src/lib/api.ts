import type { AgentData, EdgeData, TickSnapshot, InjectResult, ProbeResult } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type PopulateResponse = {
  agents: AgentData[];
  edges: EdgeData[];
};

export type CreateSimResponse = {
  sim_id: string;
  topic: string;
  agents: AgentData[];
  edges: EdgeData[];
  tick: number;
};

export type ProbeResponse = {
  probe_results: ProbeResult[];
  summary: {
    total_shifted: number;
    genuine: number;
    surface: number;
  };
};

export async function generateArgument(topic: string): Promise<string> {
  const res = await fetch(`${API_URL}/generate-argument`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic }),
  });

  if (!res.ok) {
    throw new Error(`Argument generation failed: ${res.statusText}`);
  }

  const data = await res.json();
  return data.argument;
}

export async function populateSociety(
  societyType: string = "polarized",
  nAgents: number = 25,
  topic: string = "",
): Promise<PopulateResponse> {
  const res = await fetch(`${API_URL}/populate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ society_type: societyType, n_agents: nAgents, topic }),
  });

  if (!res.ok) {
    throw new Error(`Population failed: ${res.statusText}`);
  }

  return res.json();
}

export async function createSim(
  topic: string,
  societyType: string = "polarized",
  nAgents: number = 25,
  useCached: boolean = true,
): Promise<CreateSimResponse> {
  const res = await fetch(`${API_URL}/sim/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      topic,
      society_type: societyType,
      n_agents: nAgents,
      use_cached: useCached,
    }),
  });

  if (!res.ok) {
    throw new Error(`Create sim failed: ${res.statusText}`);
  }

  return res.json();
}

export async function injectArgument(
  simId: string,
  agentId: string,
  prompt: string,
): Promise<InjectResult> {
  const res = await fetch(`${API_URL}/sim/${simId}/inject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agent_id: agentId, prompt }),
  });

  if (!res.ok) {
    throw new Error(`Inject failed: ${res.statusText}`);
  }

  return res.json();
}

export async function nextTick(simId: string): Promise<TickSnapshot> {
  const res = await fetch(`${API_URL}/sim/${simId}/next_tick`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  if (!res.ok) {
    throw new Error(`Next tick failed: ${res.statusText}`);
  }

  return res.json();
}

export async function getState(simId: string) {
  const res = await fetch(`${API_URL}/sim/${simId}/state`);

  if (!res.ok) {
    throw new Error(`Get state failed: ${res.statusText}`);
  }

  return res.json();
}

export async function runProbe(
  simId: string,
  threshold: number = 0.05,
): Promise<ProbeResponse> {
  const res = await fetch(`${API_URL}/sim/${simId}/probe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ threshold }),
  });

  if (!res.ok) {
    throw new Error(`Probe failed: ${res.statusText}`);
  }

  return res.json();
}
