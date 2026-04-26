"use client";

import { useSimStore, useCurrentAgents, useCurrentSnapshot, useOvertonWindow } from "@/lib/store";
import { BG, TEXT_PRIMARY, TEXT_MUTED } from "@/lib/colors";

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
      {/* Overton Window visualization */}
      {overton && (
        <div className="px-5 pb-2" style={mono}>
          <div className="relative h-4 mx-auto" style={{ maxWidth: 500 }}>
            {/* Full range line */}
            <div className="absolute top-1/2 left-0 right-0 h-px" style={{ background: "rgba(0,0,0,0.15)" }} />
            {/* Labels */}
            <span className="absolute left-0 top-full text-xs" style={{ color: TEXT_MUTED, fontSize: "8px", transform: "translateY(1px)" }}>-1</span>
            <span className="absolute right-0 top-full text-xs" style={{ color: TEXT_MUTED, fontSize: "8px", transform: "translateY(1px)" }}>+1</span>
            {/* Overton band */}
            <div
              className="absolute top-0 h-full transition-all duration-500"
              style={{
                left: `${((overton.low + 1) / 2) * 100}%`,
                width: `${(overton.width / 2) * 100}%`,
                background: "rgba(0,0,0,0.08)",
                border: `1px solid ${TEXT_PRIMARY}`,
              }}
            />
            {/* Agent dots */}
            {agents.map((a) => (
              <div
                key={a.id}
                className="absolute top-1/2 -translate-y-1/2 rounded-full transition-all duration-500"
                style={{
                  left: `${((a.position + 1) / 2) * 100}%`,
                  width: 3,
                  height: 3,
                  background: TEXT_PRIMARY,
                  opacity: 0.4,
                }}
              />
            ))}
            {/* Center marker */}
            <div
              className="absolute top-0 h-full w-px transition-all duration-500"
              style={{
                left: `${((overton.center + 1) / 2) * 100}%`,
                background: TEXT_PRIMARY,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
