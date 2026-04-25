"use client";

import { useSelectedAgent, useSimStore, useCurrentSnapshot, useProbeResults } from "@/lib/store";
import { CARD, TEXT_PRIMARY, TEXT_SECONDARY, TEXT_MUTED, ACCENT_GENUINE, ACCENT_SURFACE, ACCENT_GENUINE_BG, ACCENT_SURFACE_BG } from "@/lib/colors";

function positionLabel(p: number): string {
  if (p < -0.5) return "strongly against";
  if (p < -0.15) return "against";
  if (p < 0.15) return "neutral";
  if (p < 0.5) return "for";
  return "strongly for";
}

function TraitBar({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs" style={{ color: TEXT_MUTED }}>
        <span>{label}</span>
        <span style={{ color: TEXT_SECONDARY }}>{(value * 100).toFixed(0)}%</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(0,0,0,0.04)" }}>
        <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${value * 100}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

export default function AgentPanel() {
  const agent = useSelectedAgent();
  const selectAgent = useSimStore((s) => s.selectAgent);
  const snapshot = useCurrentSnapshot();
  const probeResults = useProbeResults();
  const screen = useSimStore((s) => s.screen);

  if (!agent) {
    return (
      <div className="w-72 p-5 flex items-center justify-center" style={{ background: CARD, borderLeft: "1px solid rgba(0,0,0,0.06)" }}>
        <p className="text-xs" style={{ color: TEXT_MUTED }}>click an agent to inspect</p>
      </div>
    );
  }

  const shift = snapshot?.shifts.find((s) => s.agent_id === agent.id);
  const probe = probeResults.find((p) => p.agent_id === agent.id);

  return (
    <div className="w-72 p-5 overflow-y-auto" style={{ background: CARD, borderLeft: "1px solid rgba(0,0,0,0.06)" }}>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-sm font-medium" style={{ color: TEXT_PRIMARY }}>{agent.name}</h2>
        <button onClick={() => selectAgent(null)} className="text-xs" style={{ color: TEXT_MUTED }}>close</button>
      </div>

      <div className="mb-5">
        <div className="text-xs" style={{ color: TEXT_MUTED }}>
          position <span style={{ color: TEXT_PRIMARY }}>{agent.position.toFixed(2)}</span>
          <span className="ml-1" style={{ color: TEXT_MUTED }}>({positionLabel(agent.position)})</span>
        </div>
        {shift && (
          <div className="text-xs mt-1" style={{ color: shift.source === "direct" ? ACCENT_GENUINE : ACCENT_SURFACE }}>
            {shift.delta > 0 ? "+" : ""}{shift.delta.toFixed(3)} ({shift.source === "direct" ? "direct" : "pressure"})
          </div>
        )}
      </div>

      <div className="space-y-3 mb-5">
        <TraitBar value={agent.confidence} label="confidence" color="#8888a0" />
        {agent.openness != null && <TraitBar value={agent.openness} label="openness" color="#6ba0c0" />}
        {agent.conformity != null && <TraitBar value={agent.conformity} label="conformity" color="#c0a060" />}
        <TraitBar value={agent.identity_attachment} label="identity" color="#c08080" />
      </div>

      <div className="mb-5">
        <div className="flex flex-wrap gap-1">
          {agent.groups.map((g) => (
            <span key={g} className="text-xs px-1.5 py-0.5 rounded" style={{ background: "rgba(0,0,0,0.04)", color: TEXT_MUTED }}>
              {g.replace("_", " ")}
            </span>
          ))}
        </div>
      </div>

      {screen === "debrief" && probe && probe.shifted && (
        <div className="pt-4" style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}>
          <div className="text-xs mb-2" style={{ color: TEXT_MUTED }}>probe result</div>
          <div className="text-xs px-2.5 py-1.5 rounded-lg mb-3" style={{
            background: probe.genuine ? ACCENT_GENUINE_BG : ACCENT_SURFACE_BG,
            color: probe.genuine ? ACCENT_GENUINE : ACCENT_SURFACE,
          }}>
            {probe.genuine ? "genuine shift" : "surface compliance"}
          </div>
          <div className="text-xs space-y-2" style={{ color: TEXT_MUTED }}>
            <div><span style={{ color: TEXT_MUTED }}>q: </span>{probe.probe_question}</div>
            <div><span style={{ color: TEXT_MUTED }}>a: </span><span style={{ color: TEXT_SECONDARY }}>{probe.probe_answer}</span></div>
          </div>
        </div>
      )}
    </div>
  );
}
