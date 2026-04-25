# Synthetic Society

HackTech 2026 — Listen Labs "Simulate Humanity" track. A playable simulation where you inject one argument into a society of 25 AI agents and watch belief spread through a trust network. At the end, we measure what fraction of apparent belief change is genuine vs. surface compliance.

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
- **Backend:** Python FastAPI, WebSocket for real-time state streaming
- **LLM:** Anthropic (Haiku for agent updates, Sonnet for probe)
- **Graph:** NetworkX on backend

## Agent Model (canonical — do not drift)

### Personality (fixed traits)
- `openness` — receptivity to arguments; drives Phase 1 magnitude
- `analytical` — central vs. peripheral processing; modulates what kind of arguments work
- `conformity` — susceptibility to social pressure; drives Phase 2 magnitude
- `identity_attachment` — how much belief is tied to identity; dampens both phases when high

### State (evolves during sim)
- `belief` — current position, -1 to 1
- `confidence` — how settled, 0 to 1; affects resistance and probe stability

### Per-edge parameter
- `trust` — directional, asymmetric. How much A weights B's input. Computed once at init from demographic similarity.

### Cut parameters
- ~~agreeableness~~ — redundant with conformity
- ~~influence_score~~ — should emerge from network structure (degree, bridgeness), not be a parameter

## Network
- 25 agents in 4 clusters (blue-collar, educators, young professionals, small business owners)
- Dense within-cluster edges (4–6 connections each)
- Sparse between-cluster edges (1–3 per cluster pair) — these create bridge nodes
- Trust on each edge derived from demographic similarity, not random
- Initial beliefs sampled from cluster-specific distributions with variance (clusters are not internally uniform)
- Bridge nodes emerge from graph structure, not from a stat

## Game Loop (single-message version)

### Setup
1. Generate 25 agents with cluster-sampled personalities
2. Build clustered small-world graph
3. Compute trust on every edge
4. Initialize beliefs from cluster priors

### Turn 0 — Player's only move
Player picks one agent and writes one argument message.

### Turn 0 — Phase 1 (LLM)
The targeted agent's personality + belief + the argument go to the LLM (Haiku). LLM produces a raw belief shift. The shift gets clamped:
```
actual_shift = raw_shift × openness × source_trust × (1 - identity_attachment) × (1 - confidence × resistance_factor)
```

### Turns 1–20 — Phase 2 only (deterministic, no LLM)
For every agent who shifted, neighbors feel pressure:
```
pressure_shift = sum_over_neighbors(neighbor_delta × edge_trust × my_conformity) × (1 - identity_attachment) × decay
```
Pressure cascades 1–2 hops per tick. Beliefs propagate outward through the network.

### End — The Probe
Every agent past a shift threshold gets asked a probe question — a related-but-different question that requires the underlying belief to have shifted, not just surface agreement. Genuine shifters answer coherently; surface shifters reveal inconsistency.

## Probe Design
The probe must require the agent to apply their new belief to a novel scenario. Surface-compliant agents fail because they only nodded along; they never updated the underlying model.

**Bad probes** (too close — surface compliance passes them):
- "Should min wage be raised to $14?" (same surface features)

**Good probes** (require structural belief change):
- "If a small business owner says they'll have to lay off two workers when min wage rises, what should policy do?"
- "Should states with low costs of living be allowed to set min wages below the federal level?"

Pre-write 3–4 probe pairs per topic. Test them: would a peer-pressured agent give a coherent answer? If yes, probe is too easy.

## Hard Rules
- All LLM calls use structured outputs. Never parse free text.
- Cap belief deltas in post-processing — don't trust the LLM to bound them.
- 25 agents per sim. One issue per sim. Fixed personalities, only beliefs evolve.
- Sim state is plain serializable objects.
- Do not add features, refactor, or "improve" beyond what was asked.

## Frontend Architecture (see docs/frontend-architecture.md)
- Frontend is a **playback engine** — backend runs all 20 ticks in one shot, returns a complete timeline array
- Frontend plays it back tick-by-tick with animations, no real-time sync
- Rewind/replay/scrub for free — timeline is just an array
- Probe results are pre-computed, revealed after final tick
- Force graph with expressive nodes (faces, color lerps, pulse effects, edge flashes, speech bubbles)

## Design Docs
- [Tick Mechanics](docs/tick-mechanics.md)
- [Social Graph](docs/social-graph.md)
- [Frontend Architecture](docs/frontend-architecture.md)
