"use client";

import { useEffect, useState } from "react";
import { useSimStore, useProbeResults, useCurrentAgents, useOvertonWindow, useInitialOvertonWindow } from "@/lib/store";
import { runProbe, generateHeadline } from "@/lib/api";
import { BG, CARD, TEXT_PRIMARY, TEXT_MUTED } from "@/lib/colors";
import { INFLUENCE_BUDGET } from "@/lib/types";

export default function DebriefScreen() {
  const simId = useSimStore((s) => s.simId);
  const probeResults = useProbeResults();
  const probeSummary = useSimStore((s) => s.probeSummary);
  const setProbeResults = useSimStore((s) => s.setProbeResults);
  const headline = useSimStore((s) => s.headline);
  const setHeadline = useSimStore((s) => s.setHeadline);
  const agents = useCurrentAgents();
  const selectAgent = useSimStore((s) => s.selectAgent);
  const reset = useSimStore((s) => s.reset);
  const setScreen = useSimStore((s) => s.setScreen);
  const [probing, setProbing] = useState(false);
  const influenceSpent = useSimStore((s) => s.influenceSpent);
  const overton = useOvertonWindow();
  const initialOverton = useInitialOvertonWindow();

  // Fetch probe results on mount, then headline
  useEffect(() => {
    if (!simId || probeResults.length > 0 || probing) return;
    setProbing(true);
    runProbe(simId)
      .then((res) => {
        setProbeResults(res.probe_results, res.summary);
        // Now fetch the headline with probe data
        return generateHeadline(simId, res.summary.genuine, res.summary.surface);
      })
      .then((h) => {
        setHeadline(h);
      })
      .catch((e) => {
        console.error("Probe/headline failed:", e);
      })
      .finally(() => setProbing(false));
  }, [simId]);

  const mono = { fontFamily: "'Courier New', monospace" };

  if (probing) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ background: BG }}>
        <p className="text-xs uppercase tracking-widest" style={{ color: TEXT_MUTED, ...mono }}>
          probing agents...
        </p>
      </div>
    );
  }

  const summary = probeSummary ?? { total_shifted: 0, genuine: 0, surface: 0 };
  const genuineRate = summary.total_shifted > 0 ? Math.round((summary.genuine / summary.total_shifted) * 100) : 0;
  const surfaceRate = summary.total_shifted > 0 ? Math.round((summary.surface / summary.total_shifted) * 100) : 0;
  const windowShift = overton && initialOverton ? overton.center - initialOverton.center : 0;
  const genuineProbes = probeResults.filter((p) => p.shifted && p.genuine);
  const surfaceProbes = probeResults.filter((p) => p.shifted && !p.genuine);
  const ticks = useSimStore((s) => s.ticks);
  const events = ticks.filter((t) => t.event).map((t) => t.event!);

  return (
    <div className="flex-1 overflow-y-auto py-10 px-8" style={{ background: BG }}>
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Newspaper headline */}
        {headline ? (
          <div className="text-center space-y-3 pb-2" style={{ borderBottom: `3px double ${TEXT_PRIMARY}` }}>
            <div className="text-xs uppercase tracking-[0.3em] font-bold" style={{ color: TEXT_MUTED, ...mono }}>
              the daily synthetic
            </div>
            <h1 className="text-xl font-black uppercase leading-tight tracking-wide" style={{ color: TEXT_PRIMARY, ...mono }}>
              {headline.headline}
            </h1>
            {headline.subheadline && (
              <p className="text-sm leading-relaxed" style={{ color: TEXT_PRIMARY, ...mono }}>
                {headline.subheadline}
              </p>
            )}
            {headline.editorial && (
              <p className="text-xs italic" style={{ color: TEXT_MUTED, ...mono }}>
                Editorial: {headline.editorial}
              </p>
            )}
          </div>
        ) : (
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold uppercase tracking-widest" style={{ color: TEXT_PRIMARY, ...mono }}>
              what was real?
            </h1>
            <p className="text-xs uppercase tracking-wider" style={{ color: TEXT_MUTED, ...mono }}>
              {summary.total_shifted} shifted
            </p>
          </div>
        )}

        <div className="text-center">
          <p className="text-xs uppercase tracking-wider" style={{ color: TEXT_MUTED, ...mono }}>
            {summary.total_shifted} shifted — what was real?
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            { value: summary.total_shifted, label: "shifted" },
            { value: summary.genuine, label: "genuine" },
            { value: summary.surface, label: "surface" },
            { value: `${genuineRate}%`, label: "genuine rate" },
            { value: `${windowShift >= 0 ? "+" : ""}${windowShift.toFixed(2)}`, label: "window shift" },
            { value: `${influenceSpent}/${INFLUENCE_BUDGET}`, label: "IP spent" },
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

        {/* Overton Window before/after */}
        {initialOverton && overton && (
          <div className="p-4" style={{ border: `2px solid ${TEXT_PRIMARY}` }}>
            <div className="text-xs mb-3 uppercase tracking-wider" style={{ color: TEXT_MUTED, ...mono }}>overton window shift</div>
            {[
              { label: "BEFORE", window: initialOverton, opacity: 0.3 },
              { label: "AFTER", window: overton, opacity: 1 },
            ].map((row) => (
              <div key={row.label} className="flex items-center gap-3 mb-2">
                <span className="text-xs w-12 uppercase" style={{ color: TEXT_MUTED, ...mono, fontSize: "9px" }}>{row.label}</span>
                <div className="flex-1 relative h-3">
                  <div className="absolute top-1/2 left-0 right-0 h-px" style={{ background: "rgba(0,0,0,0.1)" }} />
                  <div
                    className="absolute top-0 h-full"
                    style={{
                      left: `${((row.window.low + 1) / 2) * 100}%`,
                      width: `${(row.window.width / 2) * 100}%`,
                      background: `rgba(0,0,0,${0.08 * row.opacity})`,
                      border: `1px solid ${TEXT_PRIMARY}`,
                      opacity: row.opacity,
                    }}
                  />
                  <div
                    className="absolute top-0 h-full w-px"
                    style={{ left: `${((row.window.center + 1) / 2) * 100}%`, background: TEXT_PRIMARY, opacity: row.opacity }}
                  />
                </div>
                <span className="text-xs w-24 text-right" style={{ color: TEXT_PRIMARY, ...mono, fontSize: "9px" }}>
                  [{row.window.low.toFixed(2)}, {row.window.high.toFixed(2)}]
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Events timeline */}
        {events.length > 0 && (
          <div className="p-4" style={{ border: `2px solid ${TEXT_PRIMARY}` }}>
            <div className="text-xs mb-3 uppercase tracking-wider" style={{ color: TEXT_MUTED, ...mono }}>
              events ({events.length})
            </div>
            <div className="space-y-2">
              {events.map((ev, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="text-xs font-bold shrink-0 w-10 text-right pt-0.5"
                    style={{ color: TEXT_MUTED, ...mono, fontSize: "9px" }}>
                    T{ev.tick}
                  </div>
                  <div className="flex-1">
                    <div className="text-xs font-bold leading-relaxed" style={{ color: TEXT_PRIMARY, ...mono }}>
                      {ev.headline}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: TEXT_MUTED, ...mono, fontSize: "9px" }}>
                      {ev.affected_agents.length} affected — {ev.type.replace("_", " ")}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

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
