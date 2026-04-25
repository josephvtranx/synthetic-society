"""
Simulation tick manager, game loop, spatial drift, and win conditions.
Owner: Person A
"""

import asyncio
import statistics

from agent import Agent, update_belief, generate_population
from llm import generate_conversation, score_argument
from network import (
    create_society_graph,
    get_interaction_pairs,
    update_edge_weight,
    get_peer_average_position,
    apply_homophily_drift,
    sever_connection as network_sever,
    inject_agent as network_inject,
)


# ── Global simulation state ─────────────────────────────────────────────────
agents: dict[str, Agent] = {}
graph = None  # nx.Graph, set on init
topic: str = ""
tick_count: int = 0
tick_duration_seconds: float = 3.0
recent_events: list[dict] = []          # last 20 conversations
active_conversations: list[dict] = []   # current tick's conversations
game_mode: str = "sandbox"              # sandbox | consensus | cascade | polarization_defense
win_progress: float = 0.0
is_running: bool = False
player_broadcast_queue: list[dict] = []  # queued player messages


def init_simulation(
    sim_topic: str,
    n_agents: int,
    sim_game_mode: str,
    society_type: str,
) -> dict:
    """
    Initialize a new simulation. Resets all global state.
    Returns the first state snapshot.
    """
    global agents, graph, topic, tick_count, recent_events
    global active_conversations, game_mode, win_progress, is_running
    global player_broadcast_queue

    # TODO [A7]: Implement
    # 1. Call generate_population(n_agents, sim_topic, society_type)
    # 2. Call create_society_graph(agents)
    # 3. Reset tick_count=0, recent_events=[], active_conversations=[]
    # 4. Set topic, game_mode, win_progress=0, is_running=False
    # 5. Clear player_broadcast_queue
    # 6. Return get_state_snapshot()
    raise NotImplementedError("TODO [A7]")


def get_state_snapshot() -> dict:
    """
    Build the full state snapshot dict for broadcast.
    Schema:
    {
      "tick": int,
      "agents": [agent.to_dict() for each agent],
      "edges": [{"source": str, "target": str, "weight": float}, ...],
      "active_conversations": [...],
      "recent_events": [...],
      "stats": {"mean_position", "std_position", "polarization_index", "tick"},
      "win_progress": float,
      "game_mode": str,
      "is_running": bool
    }
    """
    # TODO [A8]: Implement
    # 1. Serialize all agents via to_dict()
    # 2. Serialize all graph edges with source, target, weight
    # 3. Compute stats: mean_position, std_position, polarization_index
    #    (polarization_index = std_position for now)
    # 4. Return the full snapshot dict
    raise NotImplementedError("TODO [A8]")


async def run_tick(broadcast_fn) -> None:
    """
    Execute one simulation tick.
    broadcast_fn: async callable that receives the state snapshot dict.
    """
    global tick_count, active_conversations, recent_events, win_progress

    # TODO [A9]: Implement the full tick loop
    # 1. Process any queued player broadcasts (TODO A12)
    # 2. pairs = get_interaction_pairs(graph, agents, n_pairs=5)
    # 3. For pairs[0:2]: call generate_conversation() + score_argument()
    # 4. For pairs[2:5]: use default scores {"logic":0.4,"emotion":0.3,"evidence":0.3}
    # 5. For all pairs: call update_belief() for both agents
    # 6. Update agent memories (append interaction, keep last 8)
    # 7. Set active_conversations with conversation details
    # 8. Update spatial targets for interacting agents
    # 9. Every 10 ticks: apply_homophily_drift() + compute_spatial_targets()
    # 10. win_progress = compute_win_progress()
    # 11. tick_count += 1
    # 12. await broadcast_fn(get_state_snapshot())
    raise NotImplementedError("TODO [A9]")


def compute_spatial_targets() -> None:
    """
    Nudge each agent's target_x/y toward similar-belief neighbors.
    Rate: 0.002 per tick. Clamp to [0.05, 0.95].
    Enforce minimum distance of 0.04 between agents.
    """
    # TODO [A10]: Implement
    raise NotImplementedError("TODO [A10]")


def compute_win_progress() -> float:
    """
    Compute win progress based on game_mode.
    "consensus": % of agents with position in [-0.25, 0.25]
    "cascade": % of agents shifted >0.4 from starting position
    "polarization_defense": 1 - std_dev of all positions
    "sandbox": always 0
    Win threshold: 0.75
    """
    # TODO [A11]: Implement
    raise NotImplementedError("TODO [A11]")


def queue_broadcast(message: str, target: str) -> None:
    """Queue a player broadcast for processing on next tick."""
    player_broadcast_queue.append({"message": message, "target": target})


async def process_broadcasts() -> None:
    """
    Process all queued player broadcasts.
    - target="all": score against 5 random agents, apply update_belief
    - target=agent_id: score against that specific agent
    """
    # TODO [A12]: Implement
    global player_broadcast_queue
    player_broadcast_queue = []


def sim_inject_agent(
    name: str,
    position: float,
    openness: float,
    conformity: float,
    influence: float,
) -> dict:
    """
    Create and inject a new agent into the simulation.
    Returns updated state snapshot.
    """
    # TODO [A13]: Implement
    # 1. Create new Agent with provided params + sensible defaults
    # 2. Add to agents dict
    # 3. Call network_inject(graph, new_agent, list(agents.keys()))
    # 4. Return get_state_snapshot()
    raise NotImplementedError("TODO [A13]")


def sim_sever_connection(agent_a_id: str, agent_b_id: str) -> dict:
    """
    Sever connection between two agents.
    Returns updated state snapshot.
    """
    # TODO [A14]: Implement
    # 1. Call network_sever(graph, agent_a_id, agent_b_id)
    # 2. Return get_state_snapshot()
    raise NotImplementedError("TODO [A14]")
