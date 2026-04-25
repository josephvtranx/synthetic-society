"""
NetworkX graph management for the society simulation.
"""

import random
import networkx as nx

from agent import Agent


def create_society_graph(agents: dict[str, Agent]) -> nx.Graph:
    """
    Create a Watts-Strogatz small-world graph and map nodes to agent IDs.
    Returns: NetworkX Graph with agent IDs as nodes and random edge weights.
    """
    n_agents = len(agents)
    if n_agents == 0:
        return nx.Graph()

    k = min(6, n_agents - 1)
    if k % 2 == 1:
        k -= 1
    k = max(2, k)

    base_graph = nx.watts_strogatz_graph(n=n_agents, k=k, p=0.1)

    agent_ids = list(agents.keys())
    mapping = {index: agent_id for index, agent_id in enumerate(agent_ids)}
    graph = nx.relabel_nodes(base_graph, mapping)

    for source, target in graph.edges():
        graph[source][target]["weight"] = round(random.uniform(0.2, 0.8), 2)

    return graph


def get_interaction_pairs(
    G: nx.Graph,
    agents: dict[str, Agent],
    n_pairs: int = 5,
) -> list[tuple[Agent, Agent]]:
    """
    Select n_pairs connected agent pairs, weighted by edge weight.
    Returns: list of (agent_a, agent_b) tuples.
    """
    edges = list(G.edges(data=True))
    if not edges:
        return []

    weights = [d.get("weight", 0.5) for _, _, d in edges]
    n_pairs = min(n_pairs, len(edges))

    chosen_indices = random.choices(range(len(edges)), weights=weights, k=n_pairs)
    # Deduplicate by index
    seen = set()
    unique_indices = []
    for idx in chosen_indices:
        if idx not in seen:
            seen.add(idx)
            unique_indices.append(idx)

    pairs = []
    for idx in unique_indices:
        src, tgt, _ = edges[idx]
        if src in agents and tgt in agents:
            pairs.append((agents[src], agents[tgt]))

    return pairs


def update_edge_weight(G: nx.Graph, agent_a_id: str, agent_b_id: str) -> None:
    """Increase edge weight by 0.05 after interaction, cap at 1.0."""
    if G.has_edge(agent_a_id, agent_b_id):
        w = G[agent_a_id][agent_b_id].get("weight", 0.5)
        G[agent_a_id][agent_b_id]["weight"] = min(1.0, w + 0.05)


def get_peer_average_position(
    G: nx.Graph,
    agent_id: str,
    agents: dict[str, Agent],
) -> float:
    """Return mean position of all graph neighbors of agent_id."""
    neighbors = list(G.neighbors(agent_id))
    if not neighbors:
        return 0.0
    positions = [agents[n].position for n in neighbors if n in agents]
    if not positions:
        return 0.0
    return sum(positions) / len(positions)


def apply_homophily_drift(
    G: nx.Graph,
    agents: dict[str, Agent],
    rate: float = 0.01,
) -> None:
    """
    Called every 10 ticks. Reshape the network based on belief similarity.
    """
    edges_to_remove = []
    for u, v, data in list(G.edges(data=True)):
        if u not in agents or v not in agents:
            continue
        w = data.get("weight", 0.5)
        diff = abs(agents[u].position - agents[v].position)
        if diff < 0.3:
            w += rate
        elif diff > 0.7:
            w -= rate * 2
        else:
            w -= rate * 0.5
        w = max(0.0, min(1.0, w))
        if w < 0.1:
            edges_to_remove.append((u, v))
        else:
            G[u][v]["weight"] = w

    for u, v in edges_to_remove:
        G.remove_edge(u, v)

    # Occasionally add edges between similar unconnected agents
    agent_ids = list(agents.keys())
    for _ in range(min(3, len(agent_ids) // 5)):
        a, b = random.sample(agent_ids, 2)
        if not G.has_edge(a, b) and abs(agents[a].position - agents[b].position) < 0.2:
            shared = set(agents[a].group_ids) & set(agents[b].group_ids)
            if shared and random.random() < 0.3:
                G.add_edge(a, b, weight=0.3)


def sever_connection(G: nx.Graph, agent_a_id: str, agent_b_id: str) -> None:
    """Remove edge between two agents if it exists."""
    if G.has_edge(agent_a_id, agent_b_id):
        G.remove_edge(agent_a_id, agent_b_id)


def inject_agent(
    G: nx.Graph,
    new_agent: Agent,
    existing_agent_ids: list[str],
) -> None:
    """Add a new node and connect it to up to 4 random existing agents."""
    G.add_node(new_agent.id)

    candidates = [
        agent_id
        for agent_id in existing_agent_ids
        if agent_id != new_agent.id and G.has_node(agent_id)
    ]
    if not candidates:
        return

    n_connections = min(4, len(candidates))
    neighbors = random.sample(candidates, k=n_connections)

    for neighbor_id in neighbors:
        G.add_edge(new_agent.id, neighbor_id, weight=round(random.uniform(0.3, 0.7), 2))
