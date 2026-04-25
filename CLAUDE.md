# Synthetic Society

HackTech 2026 — Listen Labs "Simulate Humanity" track. A multi-agent simulation of opinion change in a small society, wrapped in a playable game. Pitch: "a wind tunnel for persuasion — a simulated society where you can test what actually changes minds, validated against real human data."

## What Listen Labs Cares About
Listen Labs makes AI-moderated user research tools. Their core problem is trust: can synthetic humans produce insights a researcher would actually believe? Key questions from the prompt:
- "What triggers a genuine belief shift vs. surface-level agreement?"
- "Can you quantify how accurate your predictions are? Ground your simulation in data."

## Game Loop
The player acts as a campaign organizer trying to shift a population's view on an issue (minimum wage for the demo). They send messages, choose targets, and watch belief propagate through a social graph. After the run, a debrief shows which arguments worked and what fraction of belief shifts were genuine vs. surface compliance.

## Three Differentiators
1. **Trust-weighted belief updates.** Directed asymmetric trust edges. Message persuasive power scales with source trust. Belief deltas clamped by `openness × source_trust`.
2. **Genuine-vs-surface probe.** ~30% probability post-update second LLM call asking a different but related question. Alignment with new belief → genuine. Reversion to old → surface. Produces a real number ("37% of shifts were surface-level").
3. **Calibration against ChangeMyView.** Cornell ConvoKit CMV corpus with delta labels. Replay real threads through our engine, check if synthetic OPs award deltas to the same comments real OPs did. One chart, one correlation number.

## Stack
- Next.js 14 App Router, TypeScript strict mode, Tailwind, shadcn/ui
- Vercel AI SDK + Anthropic (Haiku for agent updates, Sonnet for judge/probe)
- Zustand for client state
- react-force-graph-2d for network visualization
- Server-sent events for sim state streaming
- Sim logic in `/lib/sim/`, API routes in `/app/api/`
- Calibration runs in separate Python notebook, results imported as static PNG

## Agent Shape (canonical — do not modify)
```ts
type Agent = {
  id: string
  name: string
  demographics: { age: number; education: string; occupation: string; region: string }
  psychographics: { openness: number; trustInstitutions: number; politicalLean: number; conformity: number }
  belief: { position: number; confidence: number; salience: number }  // position in [-1,1], confidence/salience in [0,1]
  memory: Array<{ from: string; message: string; tick: number }>
  lastMonologue?: string
}
```

## Tick Mechanics (see docs/tick-mechanics.md)
- One tick = one player action. 5 ticks per sim. Player targets 1–3 agents with a free-text message.
- **Phase 1 — Direct Influence (LLM):** targeted agents get parallel Haiku calls, raw delta clamped by `openness × source_trust`.
- **Phase 2 — Social Propagation (deterministic):** `neighbor_delta = changed_agent_delta × edge_trust × neighbor_conformity × decay_factor`. No LLM call. This is what produces surface-level agreement mechanically.

## Social Graph (see docs/social-graph.md)
- Directed weighted edges (trust), asymmetric, fixed during sim
- Trust initialized from agent demographics, not random
- Clustered small-world: 3–4 clusters of 6–8 agents, 2–3 cross-cluster bridges
- Demo clusters: blue-collar/trades (Marcus), educators (Diane), young professionals (Tyler), small business owners (bridges)

## Demo Scenario
Issue: minimum wage increase. 25 agents. Starting distribution: 60% against. Player has 5 messages over 5 ticks. Three key moments:
- Marcus (skeptical contractor, low institutional trust) visibly resists
- Diane (retired teacher, moderate openness) flips genuinely after a personal-anecdote message
- Tyler (young remote worker, high conformity) appears to flip but probe catches it as surface compliance

## Hard Rules
- All LLM calls use structured outputs via Zod schemas. Never parse free text.
- Batch agent updates with `Promise.all`. Never sequential awaits in a loop.
- Cap belief deltas in post-processing — don't trust the LLM to bound them.
- 20–30 agents per sim. One issue per sim. Fixed personalities, only beliefs update.
- Sim state is plain serializable objects.
- Do not add features, refactor, or "improve" beyond what was asked.
- Do not build code unless explicitly asked — design docs come first.

## Build Order
1. Sim engine in isolation (no UI, test via scripts)
2. Population + graph generation
3. Belief update + propagation loop
4. Frontend wired to live sim
5. Genuine-vs-surface probe
6. Calibration (separate notebook)
7. Polish + scripted demo

## Design Docs
- [Tick Mechanics](docs/tick-mechanics.md)
- [Social Graph](docs/social-graph.md)
