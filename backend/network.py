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


def create_society_graph(agents: dict[str, Agent], society_type: str = "polarized") -> nx.Graph:
    """
    Create the society graph for the given preset.
    New presets (cult, echo_chambers, random_spread) use dedicated constructors;
    all others fall through to the standard 4-cluster SBM.
    """
    if society_type == "cult":
        return _create_cult_graph(agents)
    if society_type == "echo_chambers":
        return _create_echo_chamber_graph(agents)
    if society_type == "random_spread":
        return _create_random_spread_graph(agents)
    return _create_standard_graph(agents)


def _create_standard_graph(agents: dict[str, Agent]) -> nx.Graph:
    """4-cluster stochastic block model (original logic)."""
    n_agents = len(agents)
    if n_agents == 0:
        return nx.Graph()

    n_clusters = len(CLUSTER_SIZES)
    if n_agents == 25:
        sizes = list(CLUSTER_SIZES)
    else:
        base = n_agents // n_clusters
        remainder = n_agents % n_clusters
        sizes = [base + (1 if i < remainder else 0) for i in range(n_clusters)]

    p_matrix = [
        [P_WITHIN if i == j else P_BETWEEN for j in range(n_clusters)]
        for i in range(n_clusters)
    ]

    base_graph = nx.stochastic_block_model(sizes, p_matrix)

    cluster_assignment = {}
    node_idx = 0
    for cluster_id, size in enumerate(sizes):
        for _ in range(size):
            cluster_assignment[node_idx] = cluster_id
            node_idx += 1

    agent_ids = list(agents.keys())
    mapping = {index: agent_ids[index] for index in range(n_agents)}
    graph = nx.relabel_nodes(base_graph, mapping)

    for index, agent_id in enumerate(agent_ids):
        cluster_id = cluster_assignment[index]
        graph.nodes[agent_id]["cluster"] = cluster_id

    _ensure_connected(graph)

    for u, v in graph.edges():
        u_cluster = graph.nodes[u].get("cluster", -1)
        v_cluster = graph.nodes[v].get("cluster", -1)
        graph[u][v]["weight"] = _compute_initial_trust(agents[u], agents[v], u_cluster == v_cluster)

    return graph


def _create_cult_graph(agents: dict[str, Agent]) -> nx.Graph:
    """
    Hub-and-spoke: leader connected to every follower with high trust.
    Sparse follower-follower edges so the leader's position dominates peer pressure.
    """
    graph = nx.Graph()
    graph.add_nodes_from(agents.keys())

    leader_id = next(
        a_id for a_id, a in agents.items() if "cult_leader" in a.group_ids
    )
    follower_ids = [a_id for a_id in agents if a_id != leader_id]

    graph.nodes[leader_id]["cluster"] = 0
    for f_id in follower_ids:
        graph.nodes[f_id]["cluster"] = 1

    # Leader → all followers: high trust
    for f_id in follower_ids:
        trust = round(random.uniform(0.75, 0.92), 3)
        graph.add_edge(leader_id, f_id, weight=trust)

    # Sparse follower-follower connections
    for i, f1 in enumerate(follower_ids):
        for f2 in follower_ids[i + 1:]:
            if random.random() < 0.10:
                trust = round(random.uniform(0.20, 0.45), 3)
                graph.add_edge(f1, f2, weight=trust)

    _ensure_connected(graph)
    return graph


def _create_echo_chamber_graph(agents: dict[str, Agent]) -> nx.Graph:
    """
    Two dense clusters with almost no inter-cluster bridges.
    High within-chamber trust drives rapid intra-chamber conformity.
    The few bridges mean cross-chamber arguments rarely land.
    """
    graph = nx.Graph()
    graph.add_nodes_from(agents.keys())

    left_ids = [a_id for a_id, a in agents.items() if "left_chamber" in a.group_ids]
    right_ids = [a_id for a_id, a in agents.items() if "right_chamber" in a.group_ids]

    for a_id in left_ids:
        graph.nodes[a_id]["cluster"] = 0
    for a_id in right_ids:
        graph.nodes[a_id]["cluster"] = 1

    P_WITHIN_ECHO = 0.72
    P_BETWEEN_ECHO = 0.015

    for chamber_ids in (left_ids, right_ids):
        for i, u in enumerate(chamber_ids):
            for v in chamber_ids[i + 1:]:
                if random.random() < P_WITHIN_ECHO:
                    opinion_sim = 1.0 - abs(agents[u].position - agents[v].position) / 2.0
                    trust = round(min(0.92, 0.50 + opinion_sim * 0.35), 3)
                    graph.add_edge(u, v, weight=trust)

    # A handful of weak bridges — enough to prevent total isolation
    bridges = 0
    for u in left_ids:
        for v in right_ids:
            if bridges < 3 and random.random() < P_BETWEEN_ECHO:
                graph.add_edge(u, v, weight=round(random.uniform(0.08, 0.18), 3))
                bridges += 1

    _ensure_connected(graph)
    return graph


def _create_random_spread_graph(agents: dict[str, Agent]) -> nx.Graph:
    """Erdős–Rényi graph with uniformly random trust values."""
    agent_ids = list(agents.keys())
    n = len(agent_ids)

    for a_id in agent_ids:
        agents[a_id]._cluster_id = 0

    base = nx.erdos_renyi_graph(n, 0.13)
    mapping = {i: agent_ids[i] for i in range(n)}
    graph = nx.relabel_nodes(base, mapping)

    for a_id in agent_ids:
        graph.nodes[a_id]["cluster"] = 0

    for u, v in graph.edges():
        graph[u][v]["weight"] = round(random.uniform(0.10, 0.65), 3)

    _ensure_connected(graph)
    return graph


def _compute_initial_trust(agent_a: Agent, agent_b: Agent, same_cluster: bool) -> float:
    """
    Initial trust based on opinion similarity + cluster membership + baseline.
    Simplified from v2 trust graph formula (no triadic closure at init).
      opinion_sim weight: 0.35 (strongest predictor)
      demo_sim weight:    0.25 (cluster as demographic proxy)
      ingroup bonus:      +0.10 / outgroup penalty: −0.05
      baseline:           +0.10 (everyone starts with some good faith)
    """
    opinion_sim = 1.0 - abs(agent_a.position - agent_b.position) / 2.0
    demo_sim = 1.0 if same_cluster else 0.3
    ingroup = 0.10 if same_cluster else -0.05
    trust = 0.35 * opinion_sim + 0.25 * demo_sim + ingroup + 0.10
    return round(max(0.05, min(0.95, trust)), 3)


def _ensure_connected(graph):
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


