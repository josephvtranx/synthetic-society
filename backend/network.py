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
    _ensure_connected(graph)

    # Initial trust from opinion similarity + cluster membership (McPherson et al. 2001)
    for u, v in graph.edges():
        u_cluster = graph.nodes[u].get("cluster", -1)
        v_cluster = graph.nodes[v].get("cluster", -1)
        graph[u][v]["weight"] = _compute_initial_trust(agents[u], agents[v], u_cluster == v_cluster)

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


