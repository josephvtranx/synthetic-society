"use client";

import { useSimStore, useProbeResults, useCurrentAgents } from "@/lib/store";
import { BG, CARD, TEXT_PRIMARY, TEXT_MUTED } from "@/lib/colors";

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

  const mono = { fontFamily: "'Courier New', monospace" };

  return (
    <div className="flex-1 overflow-y-auto py-10 px-8" style={{ background: BG }}>
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold uppercase tracking-widest" style={{ color: TEXT_PRIMARY, ...mono }}>
            what was real?
          </h1>
          <p className="text-xs uppercase tracking-wider" style={{ color: TEXT_MUTED, ...mono }}>
            {summary.clusters_reached} cluster{summary.clusters_reached !== 1 ? "s" : ""} reached
            / {summary.total_shifted} shifted
          </p>
        </div>

        <div className="grid grid-cols-4 gap-3">
          {[
            { value: summary.total_shifted, label: "shifted" },
            { value: summary.genuine_count, label: "genuine" },
            { value: summary.surface_count, label: "surface" },
            { value: `${genuineRate}%`, label: "genuine rate" },
          ].map((card) => (
            <div key={card.label} className="p-4 text-center" style={{ border: `2px solid ${TEXT_PRIMARY}` }}>
              <div className="text-2xl font-bold" style={{ color: TEXT_PRIMARY, ...mono }}>{card.value}</div>
              <div className="text-xs mt-1 uppercase tracking-wider" style={{ color: TEXT_MUTED, ...mono }}>{card.label}</div>
            </div>
          ))}
        </div>

        <div className="p-4" style={{ border: `2px solid ${TEXT_PRIMARY}` }}>
          <div className="text-xs mb-3 uppercase tracking-wider" style={{ color: TEXT_MUTED, ...mono }}>belief shift breakdown</div>
          <div className="h-5 overflow-hidden flex" style={{ border: `1px solid ${TEXT_PRIMARY}` }}>
            {genuineRate > 0 && (
              <div className="flex items-center justify-center text-xs font-bold" style={{ width: `${genuineRate}%`, background: TEXT_PRIMARY, color: CARD, ...mono }}>
                {genuineRate}%
              </div>
            )}
            {surfaceRate > 0 && (
              <div className="flex items-center justify-center text-xs font-bold" style={{ width: `${surfaceRate}%`, background: "rgba(0,0,0,0.2)", color: TEXT_PRIMARY, ...mono }}>
                {surfaceRate}%
              </div>
            )}
          </div>
          <div className="flex gap-4 mt-2 text-xs" style={{ color: TEXT_MUTED, ...mono }}>
            <span><span style={{ display: "inline-block", width: 8, height: 8, background: TEXT_PRIMARY, marginRight: 4 }} />GENUINE</span>
            <span><span style={{ display: "inline-block", width: 8, height: 8, background: "rgba(0,0,0,0.2)", marginRight: 4, border: `1px solid ${TEXT_PRIMARY}` }} />SURFACE</span>
          </div>
        </div>

        {genuineProbes.length > 0 && (
          <div>
            <div className="text-xs font-bold mb-3 uppercase tracking-wider" style={{ color: TEXT_PRIMARY, ...mono }}>
              genuine shifts
            </div>
            <div className="space-y-2">
              {genuineProbes.map((p) => {
                const agent = agents.find((a) => a.id === p.agent_id);
                return (
                  <div key={p.agent_id} onClick={() => selectAgent(p.agent_id)}
                    className="p-4 cursor-pointer transition-colors hover:bg-gray-50"
                    style={{ border: `2px solid ${TEXT_PRIMARY}` }}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2 h-2" style={{ background: TEXT_PRIMARY }} />
                      <span className="text-sm font-bold uppercase" style={{ color: TEXT_PRIMARY, ...mono }}>{agent?.name}</span>
                    </div>
                    <div className="text-xs space-y-1" style={{ color: TEXT_PRIMARY, ...mono }}>
                      <div><span style={{ color: TEXT_MUTED }}>Q: </span>{p.probe_question}</div>
                      <div><span style={{ color: TEXT_MUTED }}>A: </span>{p.probe_answer}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {surfaceProbes.length > 0 && (
          <div>
            <div className="text-xs font-bold mb-3 uppercase tracking-wider" style={{ color: TEXT_MUTED, ...mono }}>
              surface compliance
            </div>
            <div className="space-y-2">
              {surfaceProbes.map((p) => {
                const agent = agents.find((a) => a.id === p.agent_id);
                return (
                  <div key={p.agent_id} onClick={() => selectAgent(p.agent_id)}
                    className="p-4 cursor-pointer transition-colors hover:bg-gray-50"
                    style={{ border: `1px solid ${TEXT_MUTED}` }}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2 h-2" style={{ background: TEXT_MUTED }} />
                      <span className="text-sm font-bold uppercase" style={{ color: TEXT_MUTED, ...mono }}>{agent?.name}</span>
                    </div>
                    <div className="text-xs space-y-1" style={{ color: TEXT_PRIMARY, ...mono }}>
                      <div><span style={{ color: TEXT_MUTED }}>Q: </span>{p.probe_question}</div>
                      <div><span style={{ color: TEXT_MUTED }}>A: </span>{p.probe_answer}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex justify-center gap-3 pb-8">
          <button onClick={() => setScreen("playback")}
            className="px-5 py-2.5 text-xs uppercase tracking-widest transition-colors"
            style={{ border: `2px solid ${TEXT_PRIMARY}`, color: TEXT_PRIMARY, background: CARD, ...mono }}>
            replay
          </button>
          <button onClick={reset}
            className="px-5 py-2.5 text-xs font-bold uppercase tracking-widest transition-colors"
            style={{ background: TEXT_PRIMARY, color: CARD, ...mono }}>
            new simulation
          </button>
        </div>
      </div>
    </div>
  );
}
