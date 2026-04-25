# Frontend Architecture

## Playback Model
The frontend is a playback engine for a pre-computed timeline. No real-time sync with the backend.

### Flow
1. Player types a controversial prompt, selects a target agent, hits "Inject"
2. Backend runs all 20 ticks in one shot, returns the complete timeline + probe results
3. Frontend stores the full timeline as an array of tick snapshots in Zustand
4. Frontend plays back tick-by-tick, animating each for 2–3 seconds
5. After tick 20, probe results are revealed and debrief screen appears

### Why
- Backend can run fast — no waiting for frontend animations
- Animations can take as long as they need — no pressure from next tick arriving
- Rewind/replay for free — timeline is an array, scrub to any index
- Probe results are pre-computed — debrief is ready before animation starts

## Timeline Data Shape
```ts
type TickSnapshot = {
  tick: number;
  agents: AgentData[];        // full agent state at this tick
  shifts: AgentShift[];       // which agents shifted and by how much this tick
  propagations: Propagation[]; // which edges carried pressure this tick
};

type AgentShift = {
  agent_id: string;
  delta: number;
  new_position: number;
  source: "direct" | "pressure";  // Phase 1 or Phase 2
};

type Propagation = {
  from_id: string;
  to_id: string;
  pressure: number;
  resisted: boolean;
};

type ProbeResult = {
  agent_id: string;
  shifted: boolean;
  genuine: boolean;
  probe_question: string;
  probe_answer: string;
};

type SimTimeline = {
  ticks: TickSnapshot[];
  probe_results: ProbeResult[];
  summary: {
    total_shifted: number;
    genuine_count: number;
    surface_count: number;
    clusters_reached: number;
  };
};
```

## Playback Controls
- Play / Pause
- Speed: 0.5x, 1x, 2x
- Tick scrubber (slider from 0 to 20)
- Rewind to start

## Visual Design (force graph with expressive nodes)
- Nodes are small canvas-drawn characters (rounded body + face), not plain circles
- Expressions change on state: neutral, thinking, shifted, resistant
- Color lerps over 500ms on belief change (red ← → blue)
- Pulse effect: shifted agent's node pulses outward (expanding ring that fades)
- Edge flash: when pressure propagates, the edge briefly lights up then fades
- Speech bubbles: small floating text near a node for 2 seconds then disappears

## Screens
1. **Setup** — prompt textarea + target agent selector + inject button
2. **Playback** — graph animation with tick counter and playback controls
3. **Debrief** — probe results, genuine vs. surface breakdown, per-agent tags (green ring = genuine, orange ring = surface)
