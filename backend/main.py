"""
FastAPI app for Society Simulator.

Endpoints:
  POST /populate              — generate a preview society (caches for /sim/create)
  POST /sim/create            — start a new interactive simulation session
  POST /sim/{sim_id}/inject   — inject a user argument to a specific agent
  POST /sim/{sim_id}/next_tick — advance simulation one tick
  GET  /sim/{sim_id}/state    — get current state + full history
  POST /sim/{sim_id}/probe    — run probes on shifted agents
"""
from __future__ import annotations

import os
import uuid
import asyncio
import logging
from dataclasses import dataclass, field
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

# Load .env from backend/ dir regardless of cwd
_backend_dir = Path(__file__).resolve().parent
load_dotenv(_backend_dir / ".env")
# Also try project root
load_dotenv(_backend_dir.parent / ".env")

logger = logging.getLogger("sim")

from simulate import (
    inject_argument,
    next_tick,
    probe_agent,
    generate_stance,
    generate_all_stances,
    _serialize_agent,
)
from agent import Agent, generate_population
from network import create_society_graph
import networkx as nx

app = FastAPI(title="Society Simulator")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Session store ─────────────────────────────────────────────────────────────
@dataclass
class SimSession:
    sim_id: str
    agents: dict          # dict[str, Agent]
    graph: object         # nx.Graph
    stances: dict         # dict[str, str]
    topic: str
    tick: int = 0
    history: list = field(default_factory=list)       # list of tick snapshots
    original_positions: dict = field(default_factory=dict)


_sessions: dict[str, SimSession] = {}

# Legacy cache from /populate — reused by /sim/create
_cached_agents: dict = {}
_cached_graph = None
_cached_stances: dict = {}


def _make_edges(graph) -> list:
    return [
        {"source": u, "target": v, "weight": round(data.get("weight", 1.0), 3)}
        for u, v, data in graph.edges(data=True)
    ]


class GenerateArgumentRequest(BaseModel):
    topic: str


@app.post("/generate-argument")
async def generate_argument(req: GenerateArgumentRequest):
    """
    Transform a topic into a structured CMV-style argument.
    Returns the generated argument text.
    """
    from simulate import _get_client, PROBE_MODEL, _extract_json
    client = _get_client()

    if client:
        try:
            response = await client.messages.create(
                model=PROBE_MODEL,
                max_tokens=300,
                system=(
                    "You generate structured persuasive arguments in the style of Reddit's "
                    "r/ChangeMyView (CMV). Given a topic, write a compelling argument that "
                    "takes a clear position.\n\n"
                    "Structure:\n"
                    "1. CLAIM — one clear sentence stating the position\n"
                    "2. BECAUSE — 2-3 reasons, each one sentence, grounded in evidence or lived experience\n"
                    "3. EVEN THOUGH — acknowledge the strongest counterargument in one sentence\n"
                    "4. THEREFORE — restate why the position holds despite the counterargument\n\n"
                    "Write in first person, conversational but substantive. No bullet points or labels — "
                    "just flowing prose that follows this structure naturally. Keep it under 150 words.\n\n"
                    "Return ONLY valid JSON: {\"argument\": \"the full argument text\"}"
                ),
                messages=[{
                    "role": "user",
                    "content": f"Topic: {req.topic}",
                }],
            )
            result = _extract_json(response.content[0].text)
            return {"argument": result.get("argument", "")}
        except Exception as e:
            logger.error(f"Argument generation error: {e}")

    # Demo fallback
    return {
        "argument": (
            f"I believe we need to seriously rethink our approach to {req.topic}. "
            f"The current system isn't working for most people — the data shows growing dissatisfaction, "
            f"and the people most affected rarely get a voice in the conversation. "
            f"I understand there are valid concerns about unintended consequences and implementation costs. "
            f"But the cost of doing nothing is higher. We can design policy that addresses these concerns "
            f"while still making meaningful progress."
        ),
    }


# ── /populate (preview + cache) ───────────────────────────────────────────────
@app.post("/populate")
async def populate(body: dict):
    """
    Generate a society for the setup preview.
    Caches the result so /sim/create can reuse it without re-generating.
    """
    global _cached_agents, _cached_graph, _cached_stances

    society_type = body.get("society_type", "polarized")
    n_agents = max(5, min(50, body.get("n_agents", 25)))
    topic = body.get("topic", "")
    difficulty = body.get("difficulty", "medium")
    logger.info(f"POST /populate: type={society_type} n={n_agents} difficulty={difficulty} topic='{topic[:60]}'")

    agents = generate_population(n_agents, topic or "preview", society_type, difficulty)
    graph = create_society_graph(agents, society_type)
    stances = await generate_all_stances(agents, topic) if topic else {}

    _cached_agents = agents
    _cached_graph = graph
    _cached_stances = stances

    return {
        "agents": [_serialize_agent(a, stances) for a in agents.values()],
        "edges":  _make_edges(graph),
    }


# ── /sim/create ───────────────────────────────────────────────────────────────
class CreateSimRequest(BaseModel):
    topic: str
    society_type: str = "polarized"
    n_agents: int = 25
    use_cached: bool = True
    difficulty: str = "medium"


@app.post("/sim/create")
async def create_sim(req: CreateSimRequest):
    """
    Create a new interactive simulation session.
    Returns sim_id, initial agent states, and edge list.
    Set use_cached=true to reuse the population from the last /populate call.
    """
    n = max(5, min(50, req.n_agents))

    if req.use_cached and _cached_agents and _cached_graph is not None:
        agents = _cached_agents
        graph = _cached_graph
        stances = _cached_stances or await generate_all_stances(agents, req.topic)
        logger.info(f"POST /sim/create: reusing cached population ({len(agents)} agents)")
    else:
        agents = generate_population(n, req.topic, req.society_type, req.difficulty)
        graph = create_society_graph(agents, req.society_type)
        stances = await generate_all_stances(agents, req.topic)
        logger.info(f"POST /sim/create: fresh population ({len(agents)} agents) difficulty={req.difficulty}")

    sim_id = str(uuid.uuid4())[:8]
    session = SimSession(
        sim_id=sim_id,
        agents=agents,
        graph=graph,
        stances=stances,
        topic=req.topic,
        tick=0,
        original_positions={a.id: a.position for a in agents.values()},
    )

    tick0 = {
        "tick":          0,
        "agents":        [_serialize_agent(a, stances) for a in agents.values()],
        "shifts":        [],
        "conversations": [],
        "n_pairs":       0,
        "n_unpaired":    len(agents),
    }
    session.history.append(tick0)
    _sessions[sim_id] = session

    logger.info(f"Session {sim_id} created: topic='{req.topic}' agents={len(agents)}")

    return {
        "sim_id":  sim_id,
        "topic":   req.topic,
        "agents":  tick0["agents"],
        "edges":   _make_edges(graph),
        "tick":    0,
    }


# ── /sim/{id}/inject ──────────────────────────────────────────────────────────
class InjectRequest(BaseModel):
    agent_id: str
    prompt: str


class SetPositionRequest(BaseModel):
    agent_id: str
    position: float


@app.post("/sim/{sim_id}/inject")
async def inject(sim_id: str, req: InjectRequest):
    """
    Inject a user-written argument to a specific agent.
    Applies ELM + Asch delta immediately; returns the result including agent response.
    Does NOT advance the tick counter — call /next_tick to advance.
    """
    session = _sessions.get(sim_id)
    if not session:
        raise HTTPException(404, f"Session '{sim_id}' not found")

    result = await inject_argument(
        session.agents,
        session.graph,
        session.stances,
        req.agent_id,
        req.prompt,
        session.topic,
    )

    if "error" in result:
        raise HTTPException(400, result["error"])

    logger.info(
        f"POST /sim/{sim_id}/inject → {req.agent_id}: "
        f"delta={result.get('actual_delta', 0):+.4f}"
    )
    return result


# ── /sim/{id}/set_position ───────────────────────────────────────────────────
@app.post("/sim/{sim_id}/set_position")
async def set_position(sim_id: str, req: SetPositionRequest):
    """
    Directly set an agent's current opinion position and refresh their stance.
    This does not advance the tick counter.
    """
    session = _sessions.get(sim_id)
    if not session:
        raise HTTPException(404, f"Session '{sim_id}' not found")

    if req.agent_id not in session.agents:
        raise HTTPException(400, f"Agent {req.agent_id} not found")

    agent = session.agents[req.agent_id]
    old_position = agent.position
    new_position = max(-1.0, min(1.0, float(req.position)))
    agent.position = new_position

    if abs(new_position - old_position) > 0.001:
        session.stances[agent.id] = await generate_stance(agent, session.topic, changed=True)

    shift = round(new_position - old_position, 4)
    if 0 <= session.tick < len(session.history):
        snapshot = session.history[session.tick]
        snapshot["agents"] = [_serialize_agent(a, session.stances) for a in session.agents.values()]
        if abs(shift) > 0.001:
            snapshot["shifts"] = [
                *snapshot.get("shifts", []),
                {
                    "agent_id": agent.id,
                    "delta": shift,
                    "new_position": round(agent.position, 4),
                    "source": "direct",
                },
            ]

    logger.info(
        f"POST /sim/{sim_id}/set_position: {agent.name} {old_position:.3f}→{agent.position:.3f}"
    )

    return {
        "agent_id": agent.id,
        "old_position": round(old_position, 4),
        "new_position": round(agent.position, 4),
        "delta": shift,
        "stance": session.stances.get(agent.id, ""),
        "agent": _serialize_agent(agent, session.stances),
    }


# ── /sim/{id}/next_tick ───────────────────────────────────────────────────────
@app.post("/sim/{sim_id}/next_tick")
async def advance_tick(sim_id: str):
    """
    Advance simulation one tick.
    Each agent randomly attempts to converse with one neighbor.
    Unpaired agents sit out. Both agents in a pair update their beliefs.
    Returns the full tick snapshot.
    """
    session = _sessions.get(sim_id)
    if not session:
        raise HTTPException(404, f"Session '{sim_id}' not found")

    session.tick += 1
    snapshot = await next_tick(
        session.agents,
        session.graph,
        session.stances,
        session.topic,
        session.tick,
    )
    session.history.append(snapshot)

    logger.info(
        f"POST /sim/{sim_id}/next_tick: tick={session.tick} "
        f"pairs={snapshot['n_pairs']} shifts={len(snapshot['shifts'])}"
    )
    return snapshot


# ── /sim/{id}/state ───────────────────────────────────────────────────────────
@app.get("/sim/{sim_id}/state")
async def get_state(sim_id: str):
    """Get current simulation state including full tick history."""
    session = _sessions.get(sim_id)
    if not session:
        raise HTTPException(404, f"Session '{sim_id}' not found")

    return {
        "sim_id":   sim_id,
        "topic":    session.topic,
        "tick":     session.tick,
        "agents":   [_serialize_agent(a, session.stances) for a in session.agents.values()],
        "edges":    _make_edges(session.graph),
        "history":  session.history,
    }


# ── /sim/{id}/introduce ──────────────────────────────────────────────────────
class IntroduceRequest(BaseModel):
    agent_a_id: str
    agent_b_id: str


@app.post("/sim/{sim_id}/introduce")
async def introduce_agents(sim_id: str, req: IntroduceRequest):
    """
    Create a new trust edge between two unconnected agents.
    Costs IP on the frontend. Returns the updated edge list.
    """
    session = _sessions.get(sim_id)
    if not session:
        raise HTTPException(404, f"Session '{sim_id}' not found")

    a_id, b_id = req.agent_a_id, req.agent_b_id
    if a_id not in session.agents or b_id not in session.agents:
        raise HTTPException(400, "One or both agent IDs not found")
    if session.graph.has_edge(a_id, b_id):
        raise HTTPException(400, "These agents are already connected")

    # New edge with moderate starting trust based on opinion similarity
    a = session.agents[a_id]
    b = session.agents[b_id]
    opinion_sim = 1.0 - abs(a.position - b.position) / 2.0
    init_trust = round(min(0.40, 0.15 + opinion_sim * 0.10), 3)
    session.graph.add_edge(a_id, b_id, weight=init_trust)

    logger.info(
        f"POST /sim/{sim_id}/introduce: {a.name} <-> {b.name} trust={init_trust}"
    )

    return {
        "agent_a_id": a_id,
        "agent_b_id": b_id,
        "trust": init_trust,
        "edges": _make_edges(session.graph),
    }


# ── /sim/{id}/isolate ───────────────────────────────────────────────────────
class IsolateRequest(BaseModel):
    agent_id: str


@app.post("/sim/{sim_id}/isolate")
async def isolate_agent(sim_id: str, req: IsolateRequest):
    """
    Remove all edges from an agent, cutting them off from the network.
    They can still receive direct injections but won't participate in
    conversations or exert/receive peer pressure.
    """
    session = _sessions.get(sim_id)
    if not session:
        raise HTTPException(404, f"Session '{sim_id}' not found")

    agent_id = req.agent_id
    if agent_id not in session.agents:
        raise HTTPException(400, f"Agent {agent_id} not found")

    edges_removed = list(session.graph.edges(agent_id))
    session.graph.remove_edges_from(edges_removed)

    agent = session.agents[agent_id]
    logger.info(
        f"POST /sim/{sim_id}/isolate: {agent.name} — removed {len(edges_removed)} edges"
    )

    return {
        "agent_id": agent_id,
        "edges_removed": len(edges_removed),
        "edges": _make_edges(session.graph),
    }


# ── /sim/{id}/probe ───────────────────────────────────────────────────────────
@app.post("/sim/{sim_id}/probe")
async def run_probe(sim_id: str, body: dict = {}):
    """
    Run probes on agents that shifted past threshold.
    Genuine shifters answer follow-up questions coherently;
    surface shifters give vague or contradictory answers.
    """
    session = _sessions.get(sim_id)
    if not session:
        raise HTTPException(404, f"Session '{sim_id}' not found")

    threshold = float(body.get("threshold", 0.05))
    shifted = [
        a for a in session.agents.values()
        if abs(a.position - session.original_positions.get(a.id, a.position)) > threshold
    ]
    logger.info(f"POST /sim/{sim_id}/probe: {len(shifted)} agents shifted past {threshold}")

    probe_results = []
    for i in range(0, len(shifted), 5):
        batch = shifted[i:i + 5]
        results = await asyncio.gather(*[
            probe_agent(a, session.topic, session.original_positions.get(a.id, a.position))
            for a in batch
        ])
        probe_results.extend(results)
        if i + 5 < len(shifted):
            import asyncio as _asyncio
            await _asyncio.sleep(1.0)

    genuine = sum(1 for r in probe_results if r["genuine"])
    return {
        "probe_results": probe_results,
        "summary": {
            "total_shifted": len(shifted),
            "genuine":       genuine,
            "surface":       len(shifted) - genuine,
        },
    }


# ── /sim/{id}/headline ───────────────────────────────────────────────────────
@app.post("/sim/{sim_id}/headline")
async def generate_headline(sim_id: str, body: dict = {}):
    """
    Generate a newspaper headline + subheadline summarizing the simulation outcome.
    Call after probing — uses shift data, genuine/surface counts, and overton shift.
    """
    session = _sessions.get(sim_id)
    if not session:
        raise HTTPException(404, f"Session '{sim_id}' not found")

    from simulate import _get_client, PROBE_MODEL, _extract_json

    # Gather stats
    original = session.original_positions
    shifted_agents = [
        a for a in session.agents.values()
        if abs(a.position - original.get(a.id, a.position)) > 0.05
    ]
    total_shifted = len(shifted_agents)

    # Mean shift direction
    shifts = [a.position - original.get(a.id, a.position) for a in shifted_agents]
    mean_shift = sum(shifts) / len(shifts) if shifts else 0

    # Compute simple overton from current positions
    positions = sorted(a.position for a in session.agents.values())
    n = len(positions)
    trim = max(1, int(n * 0.15))
    trimmed = positions[trim:n - trim]
    overton_center = sum(trimmed) / len(trimmed) if trimmed else 0

    # Get probe summary if passed in body
    genuine = body.get("genuine", 0)
    surface = body.get("surface", 0)

    # Collect events from history
    events = [h.get("event", {}).get("headline", "") for h in session.history if h.get("event")]
    events_text = "; ".join(events[:5]) if events else "no major events"

    client = _get_client()
    if client:
        try:
            response = await client.messages.create(
                model=PROBE_MODEL,
                max_tokens=200,
                system=(
                    "You are a newspaper editor writing a front-page headline about a social shift "
                    "in a community. Based on the simulation data, write:\n"
                    "1. A punchy, dramatic headline (under 12 words, ALL CAPS)\n"
                    "2. A subheadline (1 sentence, normal case, adds context)\n"
                    "3. A one-sentence editorial note about whether the change seems genuine\n\n"
                    "Match the tone to the data — big shifts get dramatic headlines, "
                    "small shifts get subtle ones. If most change is surface compliance, "
                    "hint at skepticism.\n\n"
                    'Return ONLY valid JSON: {"headline": "...", "subheadline": "...", "editorial": "..."}'
                ),
                messages=[{"role": "user", "content": (
                    f"Topic: {session.topic}\n"
                    f"Community size: {len(session.agents)}\n"
                    f"Total who shifted: {total_shifted}/{len(session.agents)}\n"
                    f"Mean shift direction: {mean_shift:+.3f} ({'toward support' if mean_shift > 0 else 'toward opposition'})\n"
                    f"Genuine belief changes: {genuine}\n"
                    f"Surface compliance only: {surface}\n"
                    f"Overton window center: {overton_center:.2f}\n"
                    f"Ticks elapsed: {session.tick}\n"
                    f"Notable events: {events_text}"
                )}],
            )
            result = _extract_json(response.content[0].text)
            return {
                "headline":    result.get("headline", "COMMUNITY OPINION SHIFTS"),
                "subheadline": result.get("subheadline", ""),
                "editorial":   result.get("editorial", ""),
            }
        except Exception as e:
            logger.error(f"Headline generation error: {e}")

    # Fallback
    direction = "IN FAVOR" if mean_shift > 0 else "AGAINST"
    return {
        "headline":    f"COMMUNITY OPINION SHIFTS {direction} ON {session.topic.upper()[:30]}",
        "subheadline": f"{total_shifted} of {len(session.agents)} residents changed their stance over {session.tick} rounds of discussion.",
        "editorial":   f"Of those who shifted, {genuine} appear genuine while {surface} may be surface-level conformity.",
    }


# ── /simulate (batch compatibility) ─────────────────────────────────────────
class SimulateRequest(BaseModel):
    prompt: str
    target_agent_ids: list[str] = []
    society_type: str = "polarized"
    n_agents: int = 25


@app.post("/simulate")
async def simulate(req: SimulateRequest):
    """
    Batch compatibility endpoint — runs a full 20-tick simulation in one call.
    Wraps the interactive API: create session, inject, run 20 ticks, probe.
    Returns SimTimeline matching the frontend's expected format.
    """
    n = max(5, min(50, req.n_agents))
    topic = req.prompt[:80]

    # Reuse cached population if available
    if _cached_agents and _cached_graph is not None:
        agents = _cached_agents
        graph = _cached_graph
        stances = _cached_stances or await generate_all_stances(agents, topic)
    else:
        agents = generate_population(n, topic, req.society_type)
        graph = create_society_graph(agents)
        stances = await generate_all_stances(agents, topic)

    original_positions = {a.id: a.position for a in agents.values()}

    # Tick 0: initial state
    ticks = [{
        "tick": 0,
        "agents": [_serialize_agent(a, stances) for a in agents.values()],
        "shifts": [],
        "propagations": [],
        "conversations": [],
    }]
    all_conversations = []

    # Inject argument to each target
    for tid in req.target_agent_ids:
        if tid in agents:
            result = await inject_argument(agents, graph, stances, tid, req.prompt, topic)
            if "error" not in result:
                delta = result.get("actual_delta", 0)
                if abs(delta) > 0.001:
                    ticks[0]["shifts"].append({
                        "agent_id": tid,
                        "delta": round(delta, 4),
                        "new_position": round(agents[tid].position, 4),
                        "source": "direct",
                    })

    # Update tick 0 agents after injection
    ticks[0]["agents"] = [_serialize_agent(a, stances) for a in agents.values()]

    # Run 20 ticks
    for t in range(1, 21):
        snapshot = await next_tick(agents, graph, stances, topic, t)
        conversations = snapshot.get("conversations", [])
        all_conversations.extend(conversations)
        ticks.append({
            "tick": t,
            "agents": snapshot["agents"],
            "shifts": snapshot.get("shifts", []),
            "propagations": [],
            "conversations": conversations,
        })

    # Probe shifted agents
    threshold = 0.05
    shifted = [
        a for a in agents.values()
        if abs(a.position - original_positions.get(a.id, a.position)) > threshold
    ]
    probe_results = []
    for i in range(0, len(shifted), 5):
        batch = shifted[i:i + 5]
        results = await asyncio.gather(*[
            probe_agent(a, topic, original_positions.get(a.id, a.position))
            for a in batch
        ])
        probe_results.extend(results)
        if i + 5 < len(shifted):
            await asyncio.sleep(1.0)

    genuine = sum(1 for r in probe_results if r["genuine"])

    # Figure out which clusters were reached
    clusters_reached = len({
        a.group_ids[0] for a in agents.values()
        if a.group_ids and abs(a.position - original_positions.get(a.id, a.position)) > threshold
    })

    return {
        "target_agent_ids": req.target_agent_ids,
        "edges": _make_edges(graph),
        "ticks": ticks,
        "conversations": all_conversations,
        "probe_results": probe_results,
        "summary": {
            "total_shifted": len(shifted),
            "genuine_count": genuine,
            "surface_count": len(shifted) - genuine,
            "clusters_reached": clusters_reached,
        },
    }
