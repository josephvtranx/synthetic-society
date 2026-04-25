import type { SimTimeline, PlayerInjection, AgentData, EdgeData } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type PopulateResponse = {
  agents: AgentData[];
  edges: EdgeData[];
};

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

export async function runSimulation(injection: PlayerInjection): Promise<SimTimeline> {
  const res = await fetch(`${API_URL}/simulate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(injection),
  });

  if (!res.ok) {
    throw new Error(`Simulation failed: ${res.statusText}`);
  }

  return res.json();
}
