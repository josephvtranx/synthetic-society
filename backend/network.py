"""
NetworkX graph management for the society simulation.
Owner: Person B
"""

import random
import networkx as nx

from agent import Agent


def create_society_graph(agents: dict[str, Agent]) -> nx.Graph:
    """
    Create a Watts-Strogatz small-world graph and map nodes to agent IDs.
    Returns: NetworkX Graph with agent IDs as nodes and edge weights = 0.5.
    """
    n_agents = len(agents)

    if n_agents == 0:
        return nx.Graph()

    # Watts-Strogatz requires an even k where 0 <= k < n.
    k = min(6, n_agents - 1)
    if k % 2 == 1:
        k -= 1

    base_graph = nx.watts_strogatz_graph(n=n_agents, k=k, p=0.1)

    agent_ids = list(agents.keys())
    mapping = {index: agent_id for index, agent_id in enumerate(agent_ids)}
    graph = nx.relabel_nodes(base_graph, mapping)

    for source, target in graph.edges():
        graph[source][target]["weight"] = random.uniform(0.1, 1.0)
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
    # TODO [B2]: Implement
    # 1. Get all edges with weights
    # 2. Sample n_pairs edges weighted by edge weight
    # 3. Look up Agent objects and return as tuples
    raise NotImplementedError("TODO [B2]")


def update_edge_weight(G: nx.Graph, agent_a_id: str, agent_b_id: str) -> None:
    """Increase edge weight by 0.05 after interaction, cap at 1.0."""
    # TODO [B3]: Implement
    raise NotImplementedError("TODO [B3]")


def get_peer_average_position(
    G: nx.Graph,
    agent_id: str,
    agents: dict[str, Agent],
) -> float:
    """Return mean position of all graph neighbors of agent_id."""
    # TODO [B3]: Implement
    raise NotImplementedError("TODO [B3]")


def apply_homophily_drift(
    G: nx.Graph,
    agents: dict[str, Agent],
    rate: float = 0.01,
) -> None:
    """
    Called every 10 ticks. Reshape the network based on belief similarity.
    """
    # TODO [B4]: Implement
    # 1. For each edge: increase weight if agents have similar positions,
    #    decrease if dissimilar
    # 2. Remove edges that drop below 0.1
    # 3. Occasionally add edges between unconnected agents who share a
    #    group_id and have similar positions
    raise NotImplementedError("TODO [B4]")


def sever_connection(G: nx.Graph, agent_a_id: str, agent_b_id: str) -> None:
    """Remove edge between two agents if it exists."""
    # TODO [B5]: Implement
    raise NotImplementedError("TODO [B5]")


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
        G.add_edge(new_agent.id, neighbor_id, weight=random.uniform(0.1, 1.0))
