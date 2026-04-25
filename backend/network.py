"""
NetworkX graph management for the society simulation.
Stochastic block model with 4 clusters for realistic community structure.
"""

import random
import networkx as nx

from agent import Agent

# ── Cluster definitions ─────────────────────────────────────────────────────
# 4 clusters summing to 25
CLUSTER_SIZES = [7, 6, 7, 5]

CLUSTER_NAMES = ["blue_collar", "educators", "young_professionals", "small_business"]

# SBM probability matrix: dense within, sparse between
P_WITHIN = 0.55
P_BETWEEN = 0.04


def create_society_graph(agents: dict[str, Agent]) -> nx.Graph:
    """
    Create a stochastic block model graph with 4 clusters.
    Assigns cluster IDs to agents, sets trust weights higher within-cluster.
    Returns: NetworkX Graph with agent IDs as nodes.
    """
    n_agents = len(agents)
    if n_agents == 0:
        return nx.Graph()

    # Build cluster sizes that sum to n_agents
    n_clusters = len(CLUSTER_SIZES)
    if n_agents == 25:
        sizes = list(CLUSTER_SIZES)
    else:
        # Distribute evenly with remainder
        base = n_agents // n_clusters
        remainder = n_agents % n_clusters
        sizes = [base + (1 if i < remainder else 0) for i in range(n_clusters)]

    # Probability matrix
    p_matrix = [
        [P_WITHIN if i == j else P_BETWEEN for j in range(n_clusters)]
        for i in range(n_clusters)
    ]

    base_graph = nx.stochastic_block_model(sizes, p_matrix)

    # Build cluster assignment: node index -> cluster id
    cluster_assignment = {}
    node_idx = 0
    for cluster_id, size in enumerate(sizes):
        for _ in range(size):
            cluster_assignment[node_idx] = cluster_id
            node_idx += 1

    # Remap integer nodes to agent IDs
    agent_ids = list(agents.keys())
    mapping = {index: agent_ids[index] for index in range(n_agents)}
    graph = nx.relabel_nodes(base_graph, mapping)

    # Store cluster on graph nodes and on agents
    for index, agent_id in enumerate(agent_ids):
        cluster_id = cluster_assignment[index]
        graph.nodes[agent_id]["cluster"] = cluster_id
        agents[agent_id]._cluster_id = cluster_id
        agents[agent_id].group_ids = [CLUSTER_NAMES[cluster_id]]

    # Ensure graph is connected: add one bridge edge between disconnected components
    _ensure_connected(graph, agent_ids, cluster_assignment, mapping)

    # Set trust weights: higher within-cluster, lower between
    for u, v in graph.edges():
        u_cluster = graph.nodes[u].get("cluster", -1)
        v_cluster = graph.nodes[v].get("cluster", -1)
        if u_cluster == v_cluster:
            weight = round(random.uniform(0.5, 0.9), 2)
        else:
            weight = round(random.uniform(0.15, 0.45), 2)
        graph[u][v]["weight"] = weight

    return graph


def _ensure_connected(graph, agent_ids, cluster_assignment, mapping):
    """Add minimal bridge edges to ensure the graph is connected."""
    components = list(nx.connected_components(graph))
    while len(components) > 1:
        # Connect first two components
        c1 = list(components[0])
        c2 = list(components[1])
        u = random.choice(c1)
        v = random.choice(c2)
        graph.add_edge(u, v)
        # Re-check
        components = list(nx.connected_components(graph))


def is_bridge_node(node, graph) -> bool:
    """A bridge node has at least one edge to a different cluster."""
    my_cluster = graph.nodes[node].get("cluster", -1)
    return any(
        graph.nodes[n].get("cluster", -1) != my_cluster
        for n in graph.neighbors(node)
    )


def get_bridge_and_interior(graph) -> tuple[list, list]:
    """Return (bridge_nodes, interior_nodes) based on cross-cluster edges."""
    bridges = [n for n in graph.nodes() if is_bridge_node(n, graph)]
    interior = [n for n in graph.nodes() if not is_bridge_node(n, graph)]
    return bridges, interior


# ── Legacy helpers (kept for compatibility) ──────────────────────────────────

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


def update_edge_weight(G: nx.Graph, agent_a_id: str, agent_b_id: str) -> None:
    """Increase edge weight by 0.05 after interaction, cap at 1.0."""
    if G.has_edge(agent_a_id, agent_b_id):
        w = G[agent_a_id][agent_b_id].get("weight", 0.5)
        G[agent_a_id][agent_b_id]["weight"] = min(1.0, w + 0.05)


def apply_homophily_drift(
    G: nx.Graph,
    agents: dict[str, Agent],
    rate: float = 0.01,
) -> None:
    """Reshape the network based on belief similarity."""
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
            G.remove_edge(u, v)
        else:
            G[u][v]["weight"] = w


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
    candidates = [a for a in existing_agent_ids if a != new_agent.id and G.has_node(a)]
    if not candidates:
        return
    for n in random.sample(candidates, k=min(4, len(candidates))):
        G.add_edge(new_agent.id, n, weight=round(random.uniform(0.3, 0.7), 2))
