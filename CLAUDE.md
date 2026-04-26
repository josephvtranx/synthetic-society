# Synthetic Society

HackTech 2026 — Listen Labs "Simulate Humanity" track. A playable simulation where you inject arguments into a society of 25 AI agents and watch belief spread through a trust network. At the end, a probe mechanic measures what fraction of apparent belief change is genuine vs. surface compliance.

## Core Thesis
Belief change has two distinct mechanisms:
- **Genuine persuasion** — engaging with an argument and updating
- **Surface compliance** — drifting because your social group drifted

Real-world data can measure the first but not the second. Our simulator measures both, and a probe mechanic separates them. This addresses Listen Labs' core question: when someone changes their mind in a user interview, did they actually change their mind?

## What Listen Labs Cares About
Listen Labs makes AI-moderated user research tools. Their core problem is trust.
- "What triggers a genuine belief shift vs. surface-level agreement?"
- "Can you quantify how accurate your predictions are? Ground your simulation in data."

## Stack
- **Frontend:** Next.js App Router, TypeScript strict mode, Tailwind, shadcn/ui, Zustand, react-force-graph-2d
- **Backend:** Python FastAPI, stateful session model
- **LLM:** Anthropic (Haiku for agent conversations, Sonnet for probe)
- **Graph:** NetworkX on backend

## Agent Model (canonical — do not drift)

### Personality (fixed traits, sampled at init)
- `openness` — receptivity to arguments; drives ELM elaboration and resistance to peer pressure
- `analytical` — maps to NFC (need for cognition); determines central vs. peripheral route
- `conformity` — susceptibility to social pressure; drives Asch peer pressure magnitude
- `identity_attachment` — how much belief is tied to identity; dampens all deltas when high

### State (evolves each tick)
- `position` — current belief, −1 to +1
- `confidence` — how settled, 0 to 1; contributes to identity resistance

### Per-edge parameter
- `trust` — 0–1, evolves every tick. Initialized from opinion similarity + cluster membership.
  Grows with productive exchange, decays with friction or silence, deleted when it falls below 0.05.
  New edges form via triadic closure (friend-of-a-friend).

### Cut parameters
- ~~agreeableness~~ — redundant with conformity
- ~~influence_score~~ — emerges from network structure (degree, bridgeness), not a parameter

## Network
- 25 agents in 4 clusters (blue-collar, educators, young professionals, small business owners)
- Dense within-cluster edges, sparse between-cluster edges — bridge nodes emerge naturally
- Trust on each edge initialized from opinion_sim (0.35) + cluster_sim (0.25) + ingroup bonus + baseline 0.10
- Initial beliefs sampled from cluster-specific distributions with variance

## Game Loop (interactive)

### Setup
1. `POST /populate` — generates 25 agents + graph, caches for reuse
2. `POST /sim/create` — creates a session, returns `sim_id` + initial state

### Inject (any time, any tick)
Player picks any agent and writes an argument. `POST /sim/{id}/inject` applies the belief update immediately.

```
arg classified by LLM → arg_type, arg_quality (0–1), arg_position (−1 to +1)

delta_arg  = ELM formula (see below)
delta_peer = Asch formula from current neighborhood
actual     = (delta_arg + delta_peer) × (1 − id_resist × 0.8)
             where id_resist = identity_attachment × 0.7 + confidence × 0.3
```

### Tick (advance when ready)
`POST /sim/{id}/next_tick` — each agent randomly tries to converse with one neighbor.

**Pairing:** agents shuffle, each picks one available neighbor. No double-booking. Leftover agents sit out.

**Per conversation (A speaks, B listens):**
```
LLM generates: A's message, A's arg_type + arg_quality
               B's response, B's arg_type + arg_quality

B's delta = ELM(B, A's argument) + Asch(B's neighborhood) → apply identity resistance
A's delta = ELM(A, B's response) + Asch(A's neighborhood) → apply identity resistance
```

### ELM Formula (Petty & Cacioppo 1986)
```python
elab = analytical × 0.4 + salience × 0.3 + openness × 0.3

d_central = arg_quality × 0.12 × (arg_position − position)
       # Petty & Cacioppo (1986) Fig 3: ~0.8/7 ≈ 0.114 per unit distance
d_periph  = source_cred × 0.09 × (arg_position − position)
       # Chaiken (1980): heuristic ~75% of systematic → 0.12 × 0.75 ≈ 0.09

type_mult = {evidence: 0.5+analytical×0.5, social: 0.3+conformity×0.7,
             emotional: 0.65, repetition: 1.0−analytical×0.5}[arg_type]

cb_damp   = 1 − (1−openness) × alignment × 0.6
delta_arg = (elab×d_central + (1−elab)×d_periph) × type_mult × cb_damp
```

### Asch Formula (Asch 1951/1956; Allen & Levine 1968)
```python
opp_ratio = fraction of neighbors with opposing sign position
has_ally  = any neighbor agrees with agent's sign
u_mult    = 6.7 if not has_ally else 1.0   # Allen & Levine (1968): 37%/5.5% ≈ 6.7×
suscept   = 0.40×(1−openness) + 0.25×conformity + 0.10 + 0.15×(1−analytical)
p_update  = min(0.368 × opp_ratio × u_mult × suscept, 0.80)
       # Asch (1956): 36.8% mean conformity across 12 critical trials
delta_peer = (neighbor_mean − position) × 0.08  if rand < p_update else 0
       # Gerard, Wilhelmy & Conolley (1968): 6-10% shift per exposure
```

**Key dynamics:**
- No ally + full opposition: up to 80% chance of peer pressure update per conversation
- Single ally present: pressure drops ~6.7× (Allen & Levine 1968)
- High-conformity, low-openness agents are the primary source of surface compliance

### End — The Probe
`POST /sim/{id}/probe` — every agent past threshold gets a follow-up question requiring structural belief application. Genuine shifters answer coherently; surface shifters reveal inconsistency.

## Probe Design
The probe must require the agent to apply their new belief to a novel scenario.

**Bad probes** (surface compliance passes):
- "Should min wage be raised to $14?" (same surface features)

**Good probes** (require structural belief change):
- "If a small business owner says they'll lay off two workers when min wage rises, what should policy do?"
- "Should states with low costs of living be allowed to set minimum wages below the federal level?"

## API Summary
| Endpoint | Purpose |
|----------|---------|
| `POST /populate` | Generate preview society, cache |
| `POST /sim/create` | Start session → `sim_id` |
| `POST /sim/{id}/inject` | User injects argument to any agent |
| `POST /sim/{id}/next_tick` | Advance one tick (random pairings) |
| `GET  /sim/{id}/state` | Current state + full tick history |
| `POST /sim/{id}/probe` | Run genuine/surface probe |

## Hard Rules
- All LLM calls use structured JSON outputs. Never parse free text.
- Cap belief deltas in post-processing — never let the LLM compute the number.
- 25 agents per sim. One topic per sim. Fixed personalities, only beliefs evolve.
- Sim state is plain serializable objects.
- Trust is dynamic: initialized from opinion similarity + cluster, updated after each conversation,
  decays ×0.998/tick, edges pruned below 0.05, new edges form via triadic closure.
- Do not add features, refactor, or "improve" beyond what was asked.

## Design Docs
- [Tick Mechanics](docs/tick-mechanics.md)
- [Social Graph](docs/social-graph.md)
- [Frontend Architecture](docs/frontend-architecture.md)
