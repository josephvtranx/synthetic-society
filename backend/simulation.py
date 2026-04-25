"""
Simulation tick manager, game loop, spatial drift, and win conditions.
"""

import asyncio
import random
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
game_mode: str = "sandbox"
win_progress: float = 0.0
is_running: bool = False
has_converged: bool = False
player_broadcast_queue: list[dict] = []

# Plateau detection
PLATEAU_THRESHOLD: float = 0.01
PLATEAU_TICKS_REQUIRED: int = 5
recent_avg_deltas: list[float] = []


def init_simulation(
    sim_topic: str,
    n_agents: int,
    sim_game_mode: str,
    society_type: str,
) -> dict:
    """Initialize a new simulation. Resets all global state."""
    global agents, graph, topic, tick_count, recent_events
    global active_conversations, game_mode, win_progress, is_running
    global player_broadcast_queue, has_converged, recent_avg_deltas

    agents = generate_population(n_agents, sim_topic, society_type)
    graph = create_society_graph(agents)
    topic = sim_topic
    game_mode = sim_game_mode
    tick_count = 0
    recent_events = []
    active_conversations = []
    win_progress = 0.0
    is_running = False
    has_converged = False
    player_broadcast_queue = []
    recent_avg_deltas = []

    return get_state_snapshot()


def get_state_snapshot() -> dict:
    """Build the full state snapshot dict for broadcast."""
    positions = [a.position for a in agents.values()]
    mean_pos = sum(positions) / len(positions) if positions else 0.0
    std_pos = statistics.stdev(positions) if len(positions) > 1 else 0.0

    edges = []
    if graph:
        for u, v, data in graph.edges(data=True):
            edges.append({
                "source": u,
                "target": v,
                "weight": data.get("weight", 0.5),
            })

    return {
        "tick": tick_count,
        "agents": [a.to_dict() for a in agents.values()],
        "edges": edges,
        "active_conversations": active_conversations,
        "recent_events": recent_events[-20:],
        "stats": {
            "mean_position": round(mean_pos, 4),
            "std_position": round(std_pos, 4),
            "polarization_index": round(std_pos, 4),
            "tick": tick_count,
        },
        "win_progress": win_progress,
        "game_mode": game_mode,
        "is_running": is_running,
        "has_converged": has_converged,
    }


async def run_tick(broadcast_fn) -> None:
    """Execute one simulation tick."""
    global tick_count, active_conversations, recent_events, win_progress, has_converged

    tick_deltas = []

    # 1. Process queued player broadcasts
    await process_broadcasts()

    # 2. Select interaction pairs
    pairs = get_interaction_pairs(graph, agents, n_pairs=5)

    # 3-5. Generate conversations and update beliefs
    tick_conversations = []

    # Batch LLM calls in parallel for first 2 pairs
    import asyncio as _aio
    llm_pairs = pairs[:2]
    default_pairs = pairs[2:]

    # Fire all LLM conversation calls in parallel
    convo_tasks = [generate_conversation(a, b, topic) for a, b in llm_pairs]
    convos = await _aio.gather(*convo_tasks) if convo_tasks else []

    # Fire all scoring calls in parallel
    score_tasks = []
    for idx, (agent_a, agent_b) in enumerate(llm_pairs):
        stmt_a = convos[idx].get("agent_a_statement", "")
        stmt_b = convos[idx].get("agent_b_statement", "")
        score_tasks.append(score_argument(stmt_b, topic, agent_a))
        score_tasks.append(score_argument(stmt_a, topic, agent_b))
    all_scores = await _aio.gather(*score_tasks) if score_tasks else []

    # Build per-pair data
    pair_data = []
    for idx, (agent_a, agent_b) in enumerate(llm_pairs):
        pair_data.append({
            "stmt_a": convos[idx].get("agent_a_statement", ""),
            "stmt_b": convos[idx].get("agent_b_statement", ""),
            "scores_a": all_scores[idx * 2],
            "scores_b": all_scores[idx * 2 + 1],
        })
    for agent_a, agent_b in default_pairs:
        pair_data.append({
            "stmt_a": f"{agent_a.name} shared their perspective.",
            "stmt_b": f"{agent_b.name} responded thoughtfully.",
            "scores_a": {"logic": 0.4, "emotion": 0.3, "evidence": 0.3},
            "scores_b": {"logic": 0.4, "emotion": 0.3, "evidence": 0.3},
        })

    for i, (agent_a, agent_b) in enumerate(pairs):
        agent_a.current_interaction_partner_id = agent_b.id
        agent_b.current_interaction_partner_id = agent_a.id

        d = pair_data[i]
        stmt_a = d["stmt_a"]
        stmt_b = d["stmt_b"]
        scores_a = d["scores_a"]
        scores_b = d["scores_b"]

        # Update beliefs
        peer_avg_a = get_peer_average_position(graph, agent_a.id, agents)
        peer_avg_b = get_peer_average_position(graph, agent_b.id, agents)

        shift_a = update_belief(agent_a, scores_a, agent_b, peer_avg_a)
        shift_b = update_belief(agent_b, scores_b, agent_a, peer_avg_b)

        tick_deltas.extend([shift_a, shift_b])

        # Update edge weight
        update_edge_weight(graph, agent_a.id, agent_b.id)

        # Update memories
        agent_a.memory.append({"from": agent_b.id, "message": stmt_b, "tick": tick_count})
        agent_b.memory.append({"from": agent_a.id, "message": stmt_a, "tick": tick_count})
        agent_a.memory = agent_a.memory[-8:]
        agent_b.memory = agent_b.memory[-8:]

        # Record conversation
        convo_record = {
            "agent_a_id": agent_a.id,
            "agent_b_id": agent_b.id,
            "agent_a_name": agent_a.name,
            "agent_b_name": agent_b.name,
            "agent_a_statement": stmt_a,
            "agent_b_statement": stmt_b,
            "shift_a": round(shift_a, 4),
            "shift_b": round(shift_b, 4),
        }
        tick_conversations.append(convo_record)
        recent_events.append(convo_record)
        recent_events = recent_events[-20:]

    active_conversations = tick_conversations

    # 7. Update spatial targets — interacting agents drift toward each other
    for agent_a, agent_b in pairs:
        mid_x = (agent_a.x + agent_b.x) / 2
        mid_y = (agent_a.y + agent_b.y) / 2
        agent_a.target_x = mid_x + random.uniform(-0.05, 0.05)
        agent_a.target_y = mid_y + random.uniform(-0.05, 0.05)
        agent_b.target_x = mid_x + random.uniform(-0.05, 0.05)
        agent_b.target_y = mid_y + random.uniform(-0.05, 0.05)

    # Clear interaction partners after tick
    for a in agents.values():
        if a.current_interaction_partner_id:
            a.current_interaction_partner_id = None
            # Drift to new random target after interaction
            a.target_x = random.uniform(0.1, 0.9)
            a.target_y = random.uniform(0.1, 0.9)

    # 8. Lerp agents toward their targets
    for a in agents.values():
        a.x += (a.target_x - a.x) * 0.15
        a.y += (a.target_y - a.y) * 0.15
        a.x = max(0.05, min(0.95, a.x))
        a.y = max(0.05, min(0.95, a.y))

    # 9. Every 10 ticks: homophily drift + spatial clustering
    if tick_count > 0 and tick_count % 10 == 0:
        apply_homophily_drift(graph, agents)
        compute_spatial_targets()

    # 10. Win progress
    win_progress = compute_win_progress()

    # Plateau detection
    avg_delta = sum(tick_deltas) / len(tick_deltas) if tick_deltas else 0.0
    recent_avg_deltas.append(avg_delta)
    if len(recent_avg_deltas) >= PLATEAU_TICKS_REQUIRED:
        tail = recent_avg_deltas[-PLATEAU_TICKS_REQUIRED:]
        if all(d < PLATEAU_THRESHOLD for d in tail):
            has_converged = True

    # 11. Increment tick
    tick_count += 1

    # 12. Broadcast
    await broadcast_fn(get_state_snapshot())


def compute_spatial_targets() -> None:
    """Nudge each agent's target_x/y toward similar-belief neighbors."""
    if not graph:
        return
    for agent_id, agent in agents.items():
        neighbors = list(graph.neighbors(agent_id))
        if not neighbors:
            continue
        similar = [
            agents[n] for n in neighbors
            if n in agents and abs(agents[n].position - agent.position) < 0.4
        ]
        if not similar:
            continue
        avg_x = sum(s.x for s in similar) / len(similar)
        avg_y = sum(s.y for s in similar) / len(similar)
        agent.target_x += (avg_x - agent.target_x) * 0.002
        agent.target_y += (avg_y - agent.target_y) * 0.002
        agent.target_x = max(0.05, min(0.95, agent.target_x))
        agent.target_y = max(0.05, min(0.95, agent.target_y))

    # Enforce minimum distance
    agent_list = list(agents.values())
    for i in range(len(agent_list)):
        for j in range(i + 1, len(agent_list)):
            dx = agent_list[i].target_x - agent_list[j].target_x
            dy = agent_list[i].target_y - agent_list[j].target_y
            dist = (dx * dx + dy * dy) ** 0.5
            if dist < 0.04 and dist > 0:
                push = (0.04 - dist) / 2
                nx_dir = dx / dist
                ny_dir = dy / dist
                agent_list[i].target_x += nx_dir * push
                agent_list[i].target_y += ny_dir * push
                agent_list[j].target_x -= nx_dir * push
                agent_list[j].target_y -= ny_dir * push


def compute_win_progress() -> float:
    """Compute win progress based on game_mode."""
    if not agents:
        return 0.0

    positions = [a.position for a in agents.values()]
    n = len(positions)

    if game_mode == "consensus":
        in_center = sum(1 for p in positions if -0.25 <= p <= 0.25)
        return in_center / n
    elif game_mode == "cascade":
        shifted = sum(
            1 for a in agents.values()
            if abs(a.position - a.starting_position) > 0.4
        )
        return shifted / n
    elif game_mode == "polarization_defense":
        std = statistics.stdev(positions) if n > 1 else 0.0
        return max(0.0, 1.0 - std)
    else:  # sandbox
        return 0.0


def queue_broadcast(message: str, target: str) -> None:
    """Queue a player broadcast for processing on next tick."""
    player_broadcast_queue.append({"message": message, "target": target})


async def process_broadcasts() -> None:
    """Process all queued player broadcasts."""
    global player_broadcast_queue

    for broadcast in player_broadcast_queue:
        message = broadcast["message"]
        target = broadcast["target"]

        if target == "all":
            targets = random.sample(
                list(agents.values()),
                min(5, len(agents)),
            )
        elif target in agents:
            targets = [agents[target]]
        else:
            continue

        for agent in targets:
            scores = await score_argument(message, topic, agent)
            arg_quality = (scores["logic"] * 0.5 + scores["emotion"] * 0.3 + scores["evidence"] * 0.3) / 1.1
            raw_delta = arg_quality * 0.8 * agent.openness
            direction = 1 if random.random() > 0.5 else -1
            final_delta = raw_delta * (1 - agent.confidence) * direction
            agent.position += final_delta
            agent.position = max(-1.0, min(1.0, agent.position))
            agent.memory.append({"from": "player", "message": message, "tick": tick_count})
            agent.memory = agent.memory[-8:]

    player_broadcast_queue = []


def sim_inject_agent(
    name: str,
    position: float,
    openness: float,
    conformity: float,
    influence: float,
) -> dict:
    """Create and inject a new agent into the simulation."""
    import uuid
    agent_id = str(uuid.uuid4())[:8]
    new_agent = Agent(
        id=agent_id,
        name=name,
        age=random.randint(20, 60),
        openness=openness,
        analytical=random.uniform(0.3, 0.7),
        conformity=conformity,
        agreeableness=random.uniform(0.3, 0.7),
        influence_score=influence,
        group_ids=[
            random.choice(["young", "middle_aged", "older"]),
            random.choice(["urban", "suburban", "rural"]),
            random.choice(["college_educated", "trade_educated", "self_educated"]),
        ],
        position=position,
        confidence=0.5,
        identity_attachment=random.uniform(0.2, 0.5),
        x=random.uniform(0.1, 0.9),
        y=random.uniform(0.1, 0.9),
        starting_position=position,
    )
    new_agent.target_x = new_agent.x
    new_agent.target_y = new_agent.y

    agents[agent_id] = new_agent
    network_inject(graph, new_agent, list(agents.keys()))
    return get_state_snapshot()


def sim_sever_connection(agent_a_id: str, agent_b_id: str) -> dict:
    """Sever connection between two agents."""
    network_sever(graph, agent_a_id, agent_b_id)
    return get_state_snapshot()
