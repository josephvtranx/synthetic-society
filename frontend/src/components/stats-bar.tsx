"use client";

import { useSimStore, useCurrentAgents, useCurrentSnapshot, useOvertonWindow } from "@/lib/store";
import { BG, TEXT_PRIMARY, TEXT_MUTED } from "@/lib/colors";
import PopulationHistogram from "./population-histogram";

export default function StatsBar() {
  const screen = useSimStore((s) => s.screen);
  const currentTick = useSimStore((s) => s.currentTick);
  const topic = useSimStore((s) => s.topic);
  const injections = useSimStore((s) => s.injectResults);
  const agents = useCurrentAgents();
  const snapshot = useCurrentSnapshot();
  const overton = useOvertonWindow();

  if (screen === "setup") return null;

  const mean = agents.length > 0 ? agents.reduce((sum, a) => sum + a.position, 0) / agents.length : 0;
  const pairs = snapshot?.n_pairs ?? 0;
  const shiftsThisTick = snapshot?.shifts.length ?? 0;
  const truncatedTopic = topic.length > 40 ? topic.slice(0, 40) + "..." : topic;

  const mono = { fontFamily: "'Courier New', monospace" };

  return (
    <div style={{ background: BG, borderBottom: `2px solid ${TEXT_PRIMARY}` }}>
      <div className="px-5 py-2.5 flex items-center gap-6 text-xs uppercase tracking-wider" style={mono}>
        <span className="font-bold" style={{ color: TEXT_PRIMARY }}>synthetic society</span>
        <div className="flex items-center gap-5" style={{ color: TEXT_MUTED }}>
          <span>tick <span style={{ color: TEXT_PRIMARY, fontWeight: 700 }}>{currentTick}</span></span>
          <span>mean <span style={{ color: TEXT_PRIMARY, fontWeight: 700 }}>{mean.toFixed(2)}</span></span>
          {pairs > 0 && (
            <span>pairs <span style={{ color: TEXT_PRIMARY, fontWeight: 700 }}>{pairs}</span></span>
          )}
          {shiftsThisTick > 0 && (
            <span>shifts <span style={{ color: TEXT_PRIMARY, fontWeight: 700 }}>{shiftsThisTick}</span></span>
          )}
          {injections.length > 0 && (
            <span>injections <span style={{ color: TEXT_PRIMARY, fontWeight: 700 }}>{injections.length}</span></span>
          )}
          {overton && (
            <span>window <span style={{ color: TEXT_PRIMARY, fontWeight: 700 }}>[{overton.low.toFixed(2)}, {overton.high.toFixed(2)}]</span></span>
          )}
        </div>
        <div className="ml-auto px-3 py-1 truncate max-w-xs" style={{ border: `1px solid ${TEXT_PRIMARY}`, color: TEXT_PRIMARY, textTransform: "none", letterSpacing: "normal" }}>
          {truncatedTopic}
        </div>
      </div>
      <PopulationHistogram />
    </div>
  );
}
