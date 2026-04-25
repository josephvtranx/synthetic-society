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

## Turns 1–20 — Phase 2 (LLM conversation + Asch conformity shift)
- Shifted agents have LLM-generated conversations with their highest-trust unconvinced neighbor
- The LLM produces `raw_shift`; the actual shift is determined by **Asch-calibrated conformity pressure**

### Asch conformity model

Each agent stores a `conversation_history`: every neighbor who has spoken to them and the direction they pushed, accumulated across all ticks.

```
n_unanimous = distinct neighbors who pushed same direction (history + current speaker)
base_rate   = Asch (1956) empirical rates:
                1 voice  → 3%   (barely above noise)
                2 voices → 13%  (pressure begins)
                3 voices → 32%  (plateau onset — unanimity achieves full effect)
                4+ voices→ up to 37% (marginal gains, hard ceiling)
ally_factor = 0.17 if any prior neighbor pushed OPPOSITE direction (Allen & Levine 1968)
             else 1.0

conformity_pressure = base_rate × ally_factor × agent.conformity × (1 − identity_attachment)
actual_shift        = raw_shift × conformity_pressure
```

### Why these numbers
Asch's line-judgment experiments found that ~32% of responses conformed when three or more confederates unanimously gave the wrong answer. The rate plateaued there regardless of larger groups. Allen & Levine (1968/1971) showed that a single dissenter — even one who couldn't reliably judge the lines — dropped conformity from ~32% to ~5.5% (ratio ≈ 0.17). Bond & Smith (1996) meta-analysis confirmed the plateau and ally effects across cultures.

### Accumulation ("gaslighting") effect
- Tick 2: target's 1 neighbor speaks → 3% base × conformity trait — minimal yield
- Tick 3: a 2nd neighbor speaks the same way → jumps to 13%
- Tick 4+: 3rd unique voice → 32% — belief begins to crack
- Any dissenting voice in history → back to ~5.5% for that agent

High-conformity agents who face unanimous peer pressure across multiple ticks are the primary source of **surface compliance**. They shift without processing an argument; the probe exposes them.

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
