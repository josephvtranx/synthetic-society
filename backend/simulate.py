"""
Single-message simulation engine.
Phase 1: LLM evaluates targeted agent's response to player's argument.
Phase 2: Deterministic social pressure propagation for 20 ticks.
Probe: LLM tests whether shifts are genuine or surface compliance.
"""

import asyncio
import random
import os
import json

from agent import Agent, generate_population
from network import create_society_graph, get_peer_average_position

# ── LLM setup ──────────────────────────────────────────────────────────────

API_KEY = os.environ.get("ANTHROPIC_API_KEY")
FAST_MODEL = "claude-haiku-4-5-20251001"
PROBE_MODEL = "claude-sonnet-4-6"

_client = None

def _get_client():
    global _client
    if _client is None and API_KEY:
        import anthropic
        _client = anthropic.AsyncAnthropic(api_key=API_KEY)
    return _client


# ── Probe questions per topic ──────────────────────────────────────────────

PROBE_QUESTIONS = {
    "default": [
        "If someone you trust told you they strongly disagree with your current view on this, how would you respond?",
        "Can you think of a scenario where the opposing position would actually be the better choice?",
        "If you had to explain your position to someone who disagrees, what's the strongest argument you'd make?",
    ],
    "minimum wage": [
        "If a small business owner says they'll have to lay off two workers when min wage rises, what should policy do?",
        "Should states with low costs of living be allowed to set minimum wages below the federal level?",
        "Should tipped workers be exempt from minimum wage increases?",
        "If automation replaces minimum wage jobs after a wage increase, was the increase still worth it?",
    ],
}


def _get_probe_question(topic: str) -> str:
    questions = PROBE_QUESTIONS.get(topic.lower(), PROBE_QUESTIONS["default"])
    return random.choice(questions)


# ── Phase 1: Direct persuasion (LLM) ──────────────────────────────────────

async def phase1_direct_persuasion(
    agent: Agent,
    prompt: str,
    source_trust: float,
) -> float:
    """
    LLM evaluates how the targeted agent responds to the player's argument.
    Returns the raw belief shift before clamping.
    """
    client = _get_client()

    if client:
        try:
            response = await client.messages.create(
                model=FAST_MODEL,
                max_tokens=150,
                system=(
                    "You are simulating a real person's internal reaction to an argument. "
                    "Given their personality and current belief, estimate how much their "
                    "position would shift. Return ONLY valid JSON: "
                    '{"raw_shift": float between -0.5 and 0.5, "reasoning": "one sentence"}'
                ),
                messages=[{
                    "role": "user",
                    "content": (
                        f"Person: {agent.name}, age {agent.age}\n"
                        f"Current position: {agent.position:.2f} (-1=strongly against, 1=strongly for)\n"
                        f"Openness: {agent.openness:.2f}, Analytical: {agent.analytical:.2f}\n"
                        f"Identity attachment: {agent.identity_attachment:.2f}, Confidence: {agent.confidence:.2f}\n"
                        f"Conformity: {agent.conformity:.2f}\n\n"
                        f"Argument they just heard:\n\"{prompt}\""
                    ),
                }],
            )
            result = json.loads(response.content[0].text)
            raw = float(result.get("raw_shift", 0.0))
            return max(-0.5, min(0.5, raw))
        except Exception:
            pass

    # Demo mode: simulate based on personality
    # Don't multiply by openness here — run_phase1 clamping already applies it
    direction = 1 if random.random() > 0.5 else -1
    raw = random.uniform(0.35, 0.5) * direction
    return raw


async def run_phase1(
    agent: Agent,
    prompt: str,
    trust: float,
) -> float:
    """Run Phase 1 and apply the belief update formula with clamping."""
    raw_shift = await phase1_direct_persuasion(agent, prompt, trust)

    # Clamp: actual_shift = raw × openness × trust × (1 - identity_attachment) × (1 - confidence × resistance)
    resistance_factor = 0.3
    actual_shift = (
        raw_shift
        * agent.openness
        * trust
        * (1 - agent.identity_attachment)
        * (1 - agent.confidence * resistance_factor)
    )

    # Apply
    old_position = agent.position
    agent.position = max(-1.0, min(1.0, agent.position + actual_shift))
    return agent.position - old_position


# ── Phase 2: Social pressure propagation (deterministic) ──────────────────

RESISTANCE_THRESHOLD = 0.001
INFLUENCE_TICKS = 4  # how many ticks a shifted agent exerts pressure
PERCEPTION_CAP = 5   # max neighbors an agent tracks


def _is_pressure_source(agent: Agent) -> bool:
    return getattr(agent, '_influence_remaining', 0) > 0 and abs(getattr(agent, '_last_delta', 0)) > 0


def init_tracked_neighbors(agents: dict[str, Agent], graph) -> None:
    """Compute each agent's top-5 most-trusted neighbors once at graph init."""
    for agent_id, agent in agents.items():
        if not graph.has_node(agent_id):
            agent._tracked_neighbors = []
            continue
        neighbors = list(graph.neighbors(agent_id))
        sorted_by_trust = sorted(
            neighbors,
            key=lambda n: graph[agent_id][n].get("weight", 0.5),
            reverse=True,
        )
        agent._tracked_neighbors = sorted_by_trust[:PERCEPTION_CAP]


def phase2_propagate(agents: dict[str, Agent], graph, decay: float = 0.95) -> tuple[list, list]:
    """
    One tick of Phase 2: aggregate social pressure with perception cap.
    Each agent only tracks their top-5 most-trusted neighbors. Pressure is
    computed from the fraction of tracked neighbors that shifted (squared),
    preserving the Asch-style aggregate conformity dynamic.
    Pressure sources persist for INFLUENCE_TICKS.
    Returns (shifts, propagations) for this tick.
    """
    shifts = []
    propagations = []

    # Identify current pressure sources
    pressure_sources = {
        agent_id for agent_id, agent in agents.items()
        if _is_pressure_source(agent)
    }

    if not pressure_sources:
        return shifts, propagations

    new_deltas = {}
    for agent_id, agent in agents.items():
        tracked = getattr(agent, '_tracked_neighbors', [])
        if not tracked:
            continue

        # Which of my tracked neighbors are pressure sources?
        shifted_tracked = [n for n in tracked if n in pressure_sources]
        if not shifted_tracked:
            continue

        # Shifted fraction over tracked set (size ≤5)
        # Exponent 1.5: within-cluster reinforcement (3/4 = 0.65) is strong,
        # single cross-cluster bridge (1/4 = 0.125) is weak but not zero
        shifted_fraction = len(shifted_tracked) / len(tracked)
        conformity_response = shifted_fraction ** 1.5

        # Weighted average delta across shifted tracked neighbors
        weighted_sum = 0.0
        for neighbor_id in shifted_tracked:
            edge_trust = graph[agent_id][neighbor_id].get("weight", 0.5)
            neighbor_delta = agents[neighbor_id]._last_delta
            weighted_sum += neighbor_delta * edge_trust

            propagations.append({
                "from_id": neighbor_id,
                "to_id": agent_id,
                "pressure": round(abs(neighbor_delta * edge_trust), 4),
                "resisted": False,
            })

        weighted_avg_delta = weighted_sum / len(shifted_tracked)

        # Pressure formula: aggregate perception
        pressure = weighted_avg_delta * agent.conformity * conformity_response

        # Final shift with identity dampening and decay
        final_delta = pressure * (1 - agent.identity_attachment) * decay

        if abs(final_delta) < RESISTANCE_THRESHOLD:
            # Resisted — inoculation: confidence increases
            for p in propagations:
                if p["to_id"] == agent_id:
                    p["resisted"] = True
            if abs(pressure) > 0:
                agent.confidence = min(1.0, agent.confidence + 0.05)
        else:
            old_pos = agent.position
            agent.position = max(-1.0, min(1.0, agent.position + final_delta))
            actual = agent.position - old_pos
            new_deltas[agent_id] = actual

            shifts.append({
                "agent_id": agent_id,
                "delta": round(actual, 4),
                "new_position": round(agent.position, 4),
                "source": "pressure",
            })

    # Update influence counters
    for agent in agents.values():
        if agent.id in new_deltas and abs(new_deltas[agent.id]) > RESISTANCE_THRESHOLD:
            agent._last_delta = new_deltas[agent.id]
            agent._influence_remaining = INFLUENCE_TICKS
        else:
            agent._influence_remaining = max(0, getattr(agent, '_influence_remaining', 0) - 1)
            if agent._influence_remaining == 0:
                agent._last_delta = 0.0

    return shifts, propagations


# ── Probe: genuine vs surface ─────────────────────────────────────────────

async def probe_agent(agent: Agent, topic: str, original_position: float) -> dict:
    """
    Ask a probe question to test if belief shift is genuine.
    Returns probe result dict.
    """
    question = _get_probe_question(topic)
    client = _get_client()

    if client:
        try:
            response = await client.messages.create(
                model=PROBE_MODEL,
                max_tokens=200,
                system=(
                    "You are simulating a person answering a follow-up question. "
                    "This person recently changed their position on an issue. "
                    "If the change was GENUINE, they will give a coherent, thoughtful answer "
                    "that demonstrates deep understanding of their new position. "
                    "If the change was SURFACE-LEVEL (they just went along with social pressure), "
                    "they will give a vague, wishy-washy, or contradictory answer. "
                    "Return ONLY valid JSON: "
                    '{"answer": "their response in 1-2 sentences", "genuine": true/false}'
                ),
                messages=[{
                    "role": "user",
                    "content": (
                        f"Person: {agent.name}\n"
                        f"Original position: {original_position:.2f}\n"
                        f"Current position: {agent.position:.2f}\n"
                        f"Openness: {agent.openness:.2f}, Conformity: {agent.conformity:.2f}\n"
                        f"Identity attachment: {agent.identity_attachment:.2f}\n\n"
                        f"Follow-up question: \"{question}\""
                    ),
                }],
            )
            result = json.loads(response.content[0].text)
            return {
                "agent_id": agent.id,
                "shifted": True,
                "genuine": bool(result.get("genuine", False)),
                "probe_question": question,
                "probe_answer": result.get("answer", ""),
            }
        except Exception:
            pass

    # Demo mode: high conformity + low openness → likely surface
    genuine = agent.openness > agent.conformity or random.random() > 0.5
    if genuine:
        answer = f"I've thought about this carefully. My view shifted because the argument addressed concerns I hadn't considered before."
    else:
        answer = f"I mean... I guess? Everyone seems to think so. I'm not really sure about the specifics though."

    return {
        "agent_id": agent.id,
        "shifted": True,
        "genuine": genuine,
        "probe_question": question,
        "probe_answer": answer,
    }


# ── Main simulation runner ────────────────────────────────────────────────

async def run_simulation(
    prompt: str,
    target_agent_id: str,
    society_type: str = "polarized",
    n_agents: int = 25,
    n_ticks: int = 20,
    shift_threshold: float = 0.02,
    target_index: int = 0,
) -> dict:
    """
    Run the full simulation and return a SimTimeline.
    """
    # 1. Generate population and graph
    agents = generate_population(n_agents, prompt, society_type)
    graph = create_society_graph(agents)

    # Find target agent by ID, or fall back to index
    agent_list = list(agents.values())
    if target_agent_id in agents:
        target = agents[target_agent_id]
    else:
        idx = max(0, min(target_index, len(agent_list) - 1))
        target = agent_list[idx]

    # Serialize edges
    edges = []
    for u, v, data in graph.edges(data=True):
        edges.append({
            "source": u,
            "target": v,
            "weight": round(data.get("weight", 0.5), 3),
        })

    # Store original positions for probe comparison
    original_positions = {a.id: a.position for a in agents.values()}

    # Initialize propagation state for all agents
    init_tracked_neighbors(agents, graph)
    for a in agents.values():
        a._last_delta = 0.0
        a._influence_remaining = 0

    ticks = []

    # Tick 0: initial state
    ticks.append({
        "tick": 0,
        "agents": [_serialize_agent(a) for a in agents.values()],
        "shifts": [],
        "propagations": [],
    })

    # 2. Phase 1: Direct persuasion on target agent
    # Compute trust from player to target (use average edge weight as proxy)
    neighbor_weights = [
        graph[target.id][n].get("weight", 0.5)
        for n in graph.neighbors(target.id)
        if graph.has_edge(target.id, n)
    ] if graph.has_node(target.id) else [0.5]
    source_trust = sum(neighbor_weights) / len(neighbor_weights) if neighbor_weights else 0.5
    # Player is an outsider, moderate trust
    source_trust = min(0.7, source_trust)

    direct_delta = await run_phase1(target, prompt, source_trust)
    target._last_delta = direct_delta
    target._influence_remaining = INFLUENCE_TICKS

    tick1_shifts = []
    if abs(direct_delta) > 0.001:
        tick1_shifts.append({
            "agent_id": target.id,
            "delta": round(direct_delta, 4),
            "new_position": round(target.position, 4),
            "source": "direct",
        })

    ticks.append({
        "tick": 1,
        "agents": [_serialize_agent(a) for a in agents.values()],
        "shifts": tick1_shifts,
        "propagations": [],
    })

    # 3. Phase 2: Propagation ticks 2-20
    for t in range(2, n_ticks + 1):
        shifts, propagations = phase2_propagate(agents, graph)

        ticks.append({
            "tick": t,
            "agents": [_serialize_agent(a) for a in agents.values()],
            "shifts": shifts,
            "propagations": propagations,
        })

        # Early stop if nothing is moving and no pressure sources remain
        has_pressure_sources = any(_is_pressure_source(a) for a in agents.values())
        if not shifts and not has_pressure_sources and t > 3:
            # Pad remaining ticks with empty state
            for remaining in range(t + 1, n_ticks + 1):
                ticks.append({
                    "tick": remaining,
                    "agents": [_serialize_agent(a) for a in agents.values()],
                    "shifts": [],
                    "propagations": [],
                })
            break

    # 4. Probes: test all agents who shifted past threshold
    shifted_agents = [
        a for a in agents.values()
        if abs(a.position - original_positions[a.id]) > shift_threshold
    ]

    probe_tasks = [probe_agent(a, prompt, original_positions[a.id]) for a in shifted_agents]
    probe_results = await asyncio.gather(*probe_tasks) if probe_tasks else []

    # Add non-shifted agents as not-shifted probes
    shifted_ids = {a.id for a in shifted_agents}
    for a in agents.values():
        if a.id not in shifted_ids:
            probe_results.append({
                "agent_id": a.id,
                "shifted": False,
                "genuine": False,
                "probe_question": "",
                "probe_answer": "",
            })

    # 5. Summary
    genuine_count = sum(1 for p in probe_results if p["shifted"] and p["genuine"])
    surface_count = sum(1 for p in probe_results if p["shifted"] and not p["genuine"])

    # Count clusters reached: any agent that shifted at all (not just past probe threshold)
    all_ever_shifted_ids = set()
    for tick in ticks:
        for sh in tick["shifts"]:
            all_ever_shifted_ids.add(sh["agent_id"])
    clusters_reached = len(set(
        getattr(agents[aid], '_cluster_id', 0)
        for aid in all_ever_shifted_ids
        if aid in agents
    )) if all_ever_shifted_ids else 0
    clusters_reached = max(1, clusters_reached)

    return {
        "edges": edges,
        "ticks": ticks,
        "probe_results": list(probe_results),
        "summary": {
            "total_shifted": len(shifted_agents),
            "genuine_count": genuine_count,
            "surface_count": surface_count,
            "clusters_reached": clusters_reached,
        },
    }


def _serialize_agent(agent: Agent) -> dict:
    """Serialize agent to match frontend AgentData type."""
    return {
        "id": agent.id,
        "name": agent.name,
        "age": agent.age,
        "position": round(agent.position, 4),
        "confidence": round(agent.confidence, 3),
        "openness": round(agent.openness, 3),
        "analytical": round(agent.analytical, 3),
        "conformity": round(agent.conformity, 3),
        "identity_attachment": round(agent.identity_attachment, 3),
        "x": round(agent.x, 4),
        "y": round(agent.y, 4),
        "groups": agent.group_ids,
    }
