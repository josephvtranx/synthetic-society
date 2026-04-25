# Social Graph

## Edge Structure
- Directed weighted edges representing trust
- Asymmetric: A→B trust ≠ B→A trust
- Trust values in [0, 1], fixed for the duration of a sim (no trust updates in 5 ticks)

## Trust Initialization
Trust derived from agent attributes, not random:
```
base_trust = f(shared_region, age_proximity, education_similarity, institutional_trust_gap)
```
Similar demographics → higher trust. Large gap in `trustInstitutions` → lower trust. Player can intuit why one agent trusts another.

## Topology: Clustered Small-World
3–4 clusters of 6–8 agents. Dense within clusters (avg degree ~4 intra-cluster), sparse between (2–3 cross-cluster bridges).

### Why
- Within-cluster propagation is fast → visible feedback for the player
- Cross-cluster propagation requires hitting a bridge node → strategic puzzle
- 25 agents, ~3.5 clusters of 7, avg degree ~5 total

### Demo Clusters
- **Cluster A — Blue-collar / trades**: Marcus here, skeptical core
- **Cluster B — Educators / public sector**: Diane here, moderate middle
- **Cluster C — Young professionals / remote workers**: Tyler here, high conformity
- **Cluster D — Small business owners**: mixed views, bridge nodes

Diane is the natural cross-cluster bridge (retired teacher, cross-generational connections). Her flip is the pivotal demo moment.

## What We Avoided
- **Erdős–Rényi**: no legible structure, player can't strategize
- **Scale-free / power law**: one hub dominates, boring
- **Dynamic trust**: complexity for no payoff in 5 ticks
