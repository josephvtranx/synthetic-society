"use client";

import { useSimStore, useCurrentAgents, useCurrentSnapshot } from "@/lib/store";
import { BG, TEXT_PRIMARY, TEXT_SECONDARY, TEXT_MUTED, ACCENT_GENUINE } from "@/lib/colors";

export default function StatsBar() {
  const screen = useSimStore((s) => s.screen);
  const currentTick = useSimStore((s) => s.currentTick);
  const agents = useCurrentAgents();
  const snapshot = useCurrentSnapshot();

  if (screen === "setup") return null;

  const mean = agents.length > 0 ? agents.reduce((sum, a) => sum + a.position, 0) / agents.length : 0;
  const shiftsThisTick = snapshot?.shifts.length ?? 0;

  return (
    <div className="px-5 py-2.5 flex items-center gap-6 text-xs" style={{ background: BG, borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
      <span className="font-light tracking-wide" style={{ color: TEXT_SECONDARY }}>synthetic society</span>
      <div className="flex items-center gap-5" style={{ color: TEXT_MUTED }}>
        <span>tick <span style={{ color: TEXT_PRIMARY }}>{currentTick}</span></span>
        <span>mean <span style={{ color: TEXT_PRIMARY }}>{mean.toFixed(2)}</span></span>
        {shiftsThisTick > 0 && (
          <span>shifts <span style={{ color: ACCENT_GENUINE }}>{shiftsThisTick}</span></span>
        )}
      </div>
      <div className="ml-auto">
        {screen === "debrief" && <span style={{ color: TEXT_MUTED }}>results</span>}
      </div>
    </div>
  );
}
