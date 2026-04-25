"use client";

import { useSimStore, useProbeResults, useCurrentAgents } from "@/lib/store";
import { BG, CARD, TEXT_PRIMARY, TEXT_SECONDARY, TEXT_MUTED, ACCENT_GENUINE, ACCENT_SURFACE, ACCENT_GENUINE_BG, ACCENT_SURFACE_BG } from "@/lib/colors";

export default function DebriefScreen() {
  const timeline = useSimStore((s) => s.timeline);
  const probeResults = useProbeResults();
  const agents = useCurrentAgents();
  const selectAgent = useSimStore((s) => s.selectAgent);
  const reset = useSimStore((s) => s.reset);
  const setScreen = useSimStore((s) => s.setScreen);

  if (!timeline) return null;

  const { summary } = timeline;
  const genuineRate = summary.total_shifted > 0 ? Math.round((summary.genuine_count / summary.total_shifted) * 100) : 0;
  const surfaceRate = summary.total_shifted > 0 ? Math.round((summary.surface_count / summary.total_shifted) * 100) : 0;
  const genuineProbes = probeResults.filter((p) => p.shifted && p.genuine);
  const surfaceProbes = probeResults.filter((p) => p.shifted && !p.genuine);

  return (
    <div className="flex-1 overflow-y-auto py-10 px-8" style={{ background: BG }}>
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-light tracking-wide" style={{ color: TEXT_PRIMARY }}>what was real?</h1>
          <p className="text-sm" style={{ color: TEXT_MUTED }}>
            your idea reached {summary.clusters_reached} cluster{summary.clusters_reached !== 1 ? "s" : ""}.
            {" "}{summary.total_shifted} agents shifted.
          </p>
        </div>

        <div className="grid grid-cols-4 gap-3">
          {[
            { value: summary.total_shifted, label: "shifted", color: TEXT_PRIMARY },
            { value: summary.genuine_count, label: "genuine", color: ACCENT_GENUINE },
            { value: summary.surface_count, label: "surface", color: ACCENT_SURFACE },
            { value: `${genuineRate}%`, label: "genuine rate", color: TEXT_PRIMARY },
          ].map((card) => (
            <div key={card.label} className="rounded-xl p-4 text-center shadow-sm" style={{ background: CARD, border: "1px solid rgba(0,0,0,0.04)" }}>
              <div className="text-2xl font-light" style={{ color: card.color }}>{card.value}</div>
              <div className="text-xs mt-1" style={{ color: TEXT_MUTED }}>{card.label}</div>
            </div>
          ))}
        </div>

        <div className="rounded-xl p-4 shadow-sm" style={{ background: CARD, border: "1px solid rgba(0,0,0,0.04)" }}>
          <div className="text-xs mb-3" style={{ color: TEXT_MUTED }}>belief shift breakdown</div>
          <div className="h-5 rounded-full overflow-hidden flex" style={{ background: "rgba(0,0,0,0.04)" }}>
            {genuineRate > 0 && (
              <div className="flex items-center justify-center text-xs font-medium" style={{ width: `${genuineRate}%`, background: ACCENT_GENUINE, color: "#fff" }}>
                {genuineRate}%
              </div>
            )}
            {surfaceRate > 0 && (
              <div className="flex items-center justify-center text-xs font-medium" style={{ width: `${surfaceRate}%`, background: ACCENT_SURFACE, color: "#fff" }}>
                {surfaceRate}%
              </div>
            )}
          </div>
        </div>

        {genuineProbes.length > 0 && (
          <div>
            <div className="text-xs font-medium mb-3" style={{ color: ACCENT_GENUINE }}>genuine shifts</div>
            <div className="space-y-2">
              {genuineProbes.map((p) => {
                const agent = agents.find((a) => a.id === p.agent_id);
                return (
                  <div key={p.agent_id} onClick={() => selectAgent(p.agent_id)} className="rounded-xl p-4 cursor-pointer shadow-sm transition-shadow hover:shadow-md"
                    style={{ background: CARD, border: `1px solid ${ACCENT_GENUINE}20` }}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2 h-2 rounded-full" style={{ background: ACCENT_GENUINE }} />
                      <span className="text-sm" style={{ color: TEXT_PRIMARY }}>{agent?.name}</span>
                    </div>
                    <div className="text-xs space-y-1" style={{ color: TEXT_MUTED }}>
                      <div><span style={{ color: TEXT_MUTED }}>q: </span>{p.probe_question}</div>
                      <div><span style={{ color: TEXT_MUTED }}>a: </span><span style={{ color: TEXT_SECONDARY }}>{p.probe_answer}</span></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {surfaceProbes.length > 0 && (
          <div>
            <div className="text-xs font-medium mb-3" style={{ color: ACCENT_SURFACE }}>surface compliance</div>
            <div className="space-y-2">
              {surfaceProbes.map((p) => {
                const agent = agents.find((a) => a.id === p.agent_id);
                return (
                  <div key={p.agent_id} onClick={() => selectAgent(p.agent_id)} className="rounded-xl p-4 cursor-pointer shadow-sm transition-shadow hover:shadow-md"
                    style={{ background: CARD, border: `1px solid ${ACCENT_SURFACE}20` }}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2 h-2 rounded-full" style={{ background: ACCENT_SURFACE }} />
                      <span className="text-sm" style={{ color: TEXT_PRIMARY }}>{agent?.name}</span>
                    </div>
                    <div className="text-xs space-y-1" style={{ color: TEXT_MUTED }}>
                      <div><span style={{ color: TEXT_MUTED }}>q: </span>{p.probe_question}</div>
                      <div><span style={{ color: TEXT_MUTED }}>a: </span><span style={{ color: TEXT_SECONDARY, fontStyle: "italic" }}>{p.probe_answer}</span></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex justify-center gap-3 pb-8">
          <button onClick={() => setScreen("playback")} className="px-5 py-2.5 rounded-xl text-sm shadow-sm transition-colors"
            style={{ background: CARD, color: TEXT_SECONDARY, border: "1px solid rgba(0,0,0,0.06)" }}>
            replay
          </button>
          <button onClick={reset} className="px-5 py-2.5 rounded-xl text-sm font-medium shadow-sm transition-colors"
            style={{ background: TEXT_PRIMARY, color: CARD }}>
            new simulation
          </button>
        </div>
      </div>
    </div>
  );
}
