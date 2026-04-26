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

import uuid
import asyncio
import logging
from dataclasses import dataclass, field

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("sim")

from simulate import (
    inject_argument,
    next_tick,
    probe_agent,
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
    logger.info(f"POST /populate: type={society_type} n={n_agents} topic='{topic[:60]}'")

    agents = generate_population(n_agents, topic or "preview", society_type)
    graph = create_society_graph(agents)
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
        agents = generate_population(n, req.topic, req.society_type)
        graph = create_society_graph(agents)
        stances = await generate_all_stances(agents, req.topic)
        logger.info(f"POST /sim/create: fresh population ({len(agents)} agents)")

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
