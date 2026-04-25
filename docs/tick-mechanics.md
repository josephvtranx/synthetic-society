# Tick Mechanics

## Game Structure
Single-message game. Player gets one shot: pick one agent, write one argument. Then watch 20 ticks of cascading belief propagation.

## Turn 0 — Phase 1 (LLM)
- Player targets one agent with a free-text argument
- Haiku call: agent personality + current belief + argument → raw belief shift
- Post-processing clamp:
  ```
  actual_shift = raw_shift × openness × source_trust × (1 - identity_attachment) × (1 - confidence × resistance_factor)
  ```

## Turns 1–20 — Phase 2 (Deterministic)
- No LLM calls. Pure math. This is what makes it fast.
- Every agent who shifted exerts pressure on neighbors:
  ```
  pressure_shift = sum_over_neighbors(neighbor_delta × edge_trust × my_conformity) × (1 - identity_attachment) × decay
  ```
- Pressure cascades 1–2 hops per tick
- Beliefs propagate outward through the network

## End — Probe
- Every agent past a shift threshold gets probed
- Probe = a related-but-different question requiring the agent to *apply* their new belief to a novel scenario
- Genuine shifters answer coherently; surface shifters reveal inconsistency
- Produces a hard number: "X% of shifts were surface-level"

## Why This Design

The single-message structure isolates the two mechanisms cleanly:
- **Phase 1** produces genuine belief change (agent engaged with an argument)
- **Phase 2** produces surface compliance (agent moved because the crowd moved)

The probe tests independently of which phase caused the shift — but the mechanics ensure both kinds naturally occur rather than relying on the LLM to roleplay the difference.

High-conformity agents in Phase 2 are the primary source of surface compliance. The probe catches them because they never processed an argument — they just felt social pressure.
