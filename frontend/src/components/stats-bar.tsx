"use client";

import { useSimStore, useCurrentAgents, useCurrentSnapshot } from "@/lib/store";
import { BG, TEXT_PRIMARY, TEXT_MUTED } from "@/lib/colors";

export default function StatsBar() {
  const screen = useSimStore((s) => s.screen);
  const currentTick = useSimStore((s) => s.currentTick);
  const prompt = useSimStore((s) => s.prompt);
  const agents = useCurrentAgents();
  const snapshot = useCurrentSnapshot();

  if (screen === "setup") return null;

  const mean = agents.length > 0 ? agents.reduce((sum, a) => sum + a.position, 0) / agents.length : 0;
  const shiftsThisTick = snapshot?.shifts.length ?? 0;
  const truncatedPrompt = prompt.length > 60 ? prompt.slice(0, 60) + "..." : prompt;

  const mono = { fontFamily: "'Courier New', monospace" };

  return (
    <div className="px-5 py-2.5 flex items-center gap-6 text-xs uppercase tracking-wider" style={{ background: BG, borderBottom: `2px solid ${TEXT_PRIMARY}`, ...mono }}>
      <span className="font-bold" style={{ color: TEXT_PRIMARY }}>synthetic society</span>
      <div className="flex items-center gap-5" style={{ color: TEXT_MUTED }}>
        <span>tick <span style={{ color: TEXT_PRIMARY, fontWeight: 700 }}>{currentTick}</span></span>
        <span>mean <span style={{ color: TEXT_PRIMARY, fontWeight: 700 }}>{mean.toFixed(2)}</span></span>
        {shiftsThisTick > 0 && (
          <span>shifts <span style={{ color: TEXT_PRIMARY, fontWeight: 700 }}>{shiftsThisTick}</span></span>
        )}
      </div>
      {prompt && (
        <div className="ml-auto px-3 py-1 max-w-md truncate" style={{ border: `1px solid ${TEXT_PRIMARY}`, color: TEXT_PRIMARY, textTransform: "none", letterSpacing: "normal" }}>
          &ldquo;{truncatedPrompt}&rdquo;
        </div>
      )}
      {!prompt && screen === "debrief" && (
        <div className="ml-auto">
          <span style={{ color: TEXT_PRIMARY }}>results</span>
        </div>
      )}
    </div>
  );
}
