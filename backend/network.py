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
    # TODO [B1]: Implement
    # 1. Create nx.watts_strogatz_graph(n=len(agents), k=6, p=0.1)
    # 2. Map integer node indices to agent IDs
    # 3. Set all edge weights to 0.5
    # 4. Return the relabeled graph
    raise NotImplementedError("TODO [B1]")


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
    """Add a new agent node and connect to 4 random existing agents with weight 0.5."""
    # TODO [B5]: Implement
    raise NotImplementedError("TODO [B5]")
