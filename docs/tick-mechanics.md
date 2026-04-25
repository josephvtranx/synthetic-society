# Tick Mechanics

## Core Loop
One tick = one player action. 5 ticks total per sim run. Player sends a free-text message targeting 1–3 agents.

## Two-Phase Resolution

### Phase 1 — Direct Influence (LLM)
- Targeted agents receive the player's message
- Each gets a parallel LLM call (Haiku): "given your personality, current belief, and this message from [source], how does your position shift?"
- Raw delta returned via Zod structured output
- Post-processing clamp: `final_delta = raw_delta × openness × source_trust`
- Batched with `Promise.all`, never sequential

### Phase 2 — Social Propagation (Deterministic)
- Every agent who changed in Phase 1 influences their graph neighbors
- No LLM call — pure formula:
  ```
  neighbor_delta = changed_agent_delta × edge_trust × neighbor_conformity × decay_factor
  ```
- This mechanically produces surface-level agreement: agents shift because the crowd shifted, not because they engaged with an argument

## Why This Design
The two-phase structure directly answers Listen Labs' core question: "What triggers a genuine belief shift vs. surface-level agreement?"

- **Phase 1 shifts** (direct persuasion with content) → more likely genuine
- **Phase 2 shifts** (social pressure, no argument) → more likely surface
- The genuine-vs-surface probe tests independently of phase — but the mechanics naturally produce both kinds of shift rather than relying on the LLM to roleplay the difference
