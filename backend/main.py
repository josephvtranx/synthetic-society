"""
FastAPI app for Society Simulator.
Two endpoints: /populate (preview) and /simulate (run full sim).
"""

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("sim")

from simulate import run_simulation, generate_all_stances
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

# ── Cached population from last /populate call ───────────────────────────
_cached_agents: dict[str, Agent] = {}
_cached_graph: nx.Graph | None = None
_cached_stances: dict[str, str] = {}


class SimulateRequest(BaseModel):
    prompt: str
    target_agent_ids: list[str] = []
    society_type: str = "polarized"
    n_agents: int = 25


@app.post("/populate")
async def populate(body: dict):
    """
    Generate a population and graph for the setup preview.
    Caches agents, graph, and stances so /simulate can reuse them.
    """
    global _cached_agents, _cached_graph, _cached_stances

    society_type = body.get("society_type", "polarized")
    n_agents = max(5, min(50, body.get("n_agents", 25)))
    topic = body.get("topic", "")
    logger.info(f"POST /populate: society_type={society_type} n_agents={n_agents} topic=\"{topic[:60]}\"")

    agents = generate_population(n_agents, topic or "preview", society_type)
    graph = create_society_graph(agents)

    # Generate stances if a topic is provided
    stances: dict[str, str] = {}
    if topic:
        stances = await generate_all_stances(agents, topic)

    # Cache for /simulate
    _cached_agents = agents
    _cached_graph = graph
    _cached_stances = stances

    agents_list = []
    for a in agents.values():
        agent_data: dict = {
            "id": a.id,
            "name": a.name,
            "age": a.age,
            "position": round(a.position, 4),
            "confidence": round(a.confidence, 3),
            "openness": round(a.openness, 3),
            "analytical": round(a.analytical, 3),
            "conformity": round(a.conformity, 3),
            "identity_attachment": round(a.identity_attachment, 3),
            "x": round(a.x, 4),
            "y": round(a.y, 4),
            "groups": a.group_ids,
        }
        if a.id in stances:
            agent_data["stance"] = stances[a.id]
        agents_list.append(agent_data)

    edges = []
    for u, v, data in graph.edges(data=True):
        edges.append({
            "source": u,
            "target": v,
            "weight": round(data.get("weight", 0.5), 3),
        })

    return {"agents": agents_list, "edges": edges}


@app.post("/simulate")
async def simulate(req: SimulateRequest):
    """
    Run the full single-message simulation.
    Reuses the cached population from /populate if the target agent exists in it.
    """
    # Check if we can reuse the cached population
    use_cache = (
        _cached_agents
        and _cached_graph is not None
        and all(tid in _cached_agents for tid in req.target_agent_ids)
    )

    if use_cache:
        logger.info(f"POST /simulate: REUSING cached population ({len(_cached_agents)} agents)")
    else:
        logger.info(f"POST /simulate: generating fresh population")

    logger.info(f"  targets={req.target_agent_ids} type={req.society_type} n={req.n_agents} prompt=\"{req.prompt[:80]}\"")

    result = await run_simulation(
        prompt=req.prompt,
        target_agent_ids=req.target_agent_ids,
        society_type=req.society_type,
        n_agents=max(5, min(50, req.n_agents)),
        agents=_cached_agents if use_cache else None,
        graph=_cached_graph if use_cache else None,
        stances=_cached_stances if use_cache else None,
    )
    return result
