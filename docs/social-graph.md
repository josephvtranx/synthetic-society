# Social Graph

## Edge Structure
- Directed weighted edges representing trust
- Asymmetric: A→B trust ≠ B→A trust
- Trust values in [0, 1], computed once at init, fixed for duration of sim

## Trust Initialization
Trust derived from demographic similarity, not random:
```
base_trust = f(shared_region, age_proximity, education_similarity)
```
Similar demographics → higher trust. Player can look at two agents and intuit why one trusts the other.

## Topology: Clustered Small-World
25 agents in 4 clusters. Dense within clusters (4–6 connections each), sparse between (1–3 edges per cluster pair).

### Clusters
- **Blue-collar / trades** — skeptical of top-down policy, high identity attachment
- **Educators / public sector** — moderate openness, cross-generational connections
- **Young professionals / remote workers** — high conformity, low identity attachment
- **Small business owners** — mixed views, some bridge nodes to other clusters

### Bridge Nodes
Bridge nodes are agents with cross-cluster edges. They're not labeled — they emerge from graph structure. Strategic core of the game: identifying and targeting bridges with high cross-cluster trust.

### Initial Beliefs
Sampled from cluster-specific distributions with variance. Clusters are not internally uniform — there's spread within each group. This prevents the sim from feeling deterministic.

## What We Avoided
- **Erdős–Rényi**: no legible structure, player can't strategize
- **Scale-free / power law**: one hub dominates, boring
- **Dynamic trust**: complexity for no payoff in 20 ticks
- **Influence as a parameter**: influence should emerge from degree and bridgeness, not be assigned
