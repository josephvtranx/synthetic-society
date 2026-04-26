"use client";

import { useEffect, useState } from "react";
import { useSimStore, useProbeResults, useCurrentAgents, useOvertonWindow, useInitialOvertonWindow } from "@/lib/store";
import { runProbe, generateHeadline } from "@/lib/api";
import { BG, SURF, BORDER, BORDER_MD, TEXT_PRIMARY, TEXT_SECONDARY, TEXT_MUTED, GENUINE, COMPLIANT, ACTION, AGAINST, FONT_UI, FONT_MONO, RAISED } from "@/lib/colors";
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
  const ticks = useSimStore((s) => s.ticks);
  const events = ticks.filter((t) => t.event).map((t) => t.event!);

  // Fetch probe results on mount, then headline
  useEffect(() => {
    if (!simId || probeResults.length > 0 || probing) return;
    setProbing(true);
    runProbe(simId)
      .then((res) => {
        setProbeResults(res.probe_results, res.summary);
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

  if (probing) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ background: BG }}>
        <p style={{ fontFamily: FONT_UI, fontSize: 12, color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: "0.12em" }}>
          Probing agents...
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

  return (
    <div className="flex-1 overflow-y-auto py-10 px-8" style={{ background: BG }}>
      <div className="max-w-2xl mx-auto space-y-7">
        {/* Newspaper headline */}
        {headline ? (
          <div className="text-center space-y-2.5 pb-4" style={{ borderBottom: `3px double ${BORDER_MD}` }}>
            <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: "0.3em", fontWeight: 500 }}>
              The Daily Synthetic
            </div>
            <h1 style={{ fontFamily: FONT_UI, fontSize: 20, fontWeight: 800, color: TEXT_PRIMARY, lineHeight: 1.3, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              {headline.headline}
            </h1>
            {headline.subheadline && (
              <p style={{ fontFamily: FONT_UI, fontSize: 13, color: TEXT_SECONDARY, lineHeight: 1.6 }}>
                {headline.subheadline}
              </p>
            )}
            {headline.editorial && (
              <p style={{ fontFamily: FONT_UI, fontSize: 11, fontStyle: "italic", color: TEXT_MUTED }}>
                Editorial: {headline.editorial}
              </p>
            )}
          </div>
        ) : (
          <div className="text-center space-y-2">
            <h1 style={{ fontFamily: FONT_UI, fontSize: 22, fontWeight: 700, color: TEXT_PRIMARY, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              What Was Real?
            </h1>
            <p style={{ fontFamily: FONT_UI, fontSize: 12, color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: "0.1em" }}>
              {summary.total_shifted} shifted
            </p>
          </div>
        )}

        <div className="text-center">
          <p style={{ fontFamily: FONT_UI, fontSize: 11, color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: "0.1em" }}>
            {summary.total_shifted} shifted — what was real?
          </p>
        </div>

        {/* Score cards */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { value: summary.total_shifted, label: "shifted", color: TEXT_PRIMARY },
            { value: summary.genuine, label: "genuine", color: GENUINE },
            { value: summary.surface, label: "surface", color: COMPLIANT },
            { value: `${genuineRate}%`, label: "genuine rate", color: GENUINE },
            { value: `${windowShift >= 0 ? "+" : ""}${windowShift.toFixed(2)}`, label: "window shift", color: ACTION },
            { value: `${influenceSpent}/${INFLUENCE_BUDGET}`, label: "IP spent", color: ACTION },
          ].map((card) => (
            <div key={card.label} className="p-4 text-center" style={{ background: SURF, border: `1px solid ${BORDER}`, borderRadius: 8 }}>
              <div style={{ fontFamily: FONT_MONO, fontSize: 22, fontWeight: 700, color: card.color }}>{card.value}</div>
              <div style={{ fontFamily: FONT_UI, fontSize: 10, color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 4 }}>{card.label}</div>
            </div>
          ))}
        </div>

        {/* Belief shift breakdown */}
        <div className="p-4" style={{ background: SURF, border: `1px solid ${BORDER}`, borderRadius: 8 }}>
          <div style={{ fontFamily: FONT_UI, fontSize: 10, fontWeight: 600, color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
            Belief Shift Breakdown
          </div>
          <div className="overflow-hidden flex" style={{ height: 20, borderRadius: 4, background: "rgba(0,0,0,0.06)" }}>
            {genuineRate > 0 && (
              <div className="flex items-center justify-center" style={{ width: `${genuineRate}%`, background: GENUINE, fontFamily: FONT_MONO, fontSize: 10, fontWeight: 700, color: "white" }}>
                {genuineRate}%
              </div>
            )}
            {surfaceRate > 0 && (
              <div className="flex items-center justify-center" style={{ width: `${surfaceRate}%`, background: COMPLIANT, fontFamily: FONT_MONO, fontSize: 10, fontWeight: 700, color: "white" }}>
                {surfaceRate}%
              </div>
            )}
          </div>
          <div className="flex gap-5 mt-2.5" style={{ fontFamily: FONT_UI, fontSize: 10, color: TEXT_SECONDARY }}>
            <span className="flex items-center gap-1.5">
              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: GENUINE }} />
              Genuine
            </span>
            <span className="flex items-center gap-1.5">
              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: COMPLIANT }} />
              Surface
            </span>
          </div>
        </div>

        {/* Overton Window before/after */}
        {initialOverton && overton && (
          <div className="p-4" style={{ background: SURF, border: `1px solid ${BORDER}`, borderRadius: 8 }}>
            <div style={{ fontFamily: FONT_UI, fontSize: 10, fontWeight: 600, color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
              Overton Window Shift
            </div>
            {[
              { label: "Before", window: initialOverton, color: TEXT_MUTED, opacity: 0.4 },
              { label: "After", window: overton, color: ACTION, opacity: 1 },
            ].map((row) => (
              <div key={row.label} className="flex items-center gap-3 mb-2.5">
                <span style={{ fontFamily: FONT_MONO, fontSize: 9, fontWeight: 600, color: row.color, width: 44, textTransform: "uppercase" }}>{row.label}</span>
                <div className="flex-1 relative" style={{ height: 12 }}>
                  <div className="absolute top-1/2 left-0 right-0" style={{ height: 1, background: BORDER }} />
                  <div className="absolute top-0 h-full rounded-sm" style={{
                    left: `${((row.window.low + 1) / 2) * 100}%`,
                    width: `${(row.window.width / 2) * 100}%`,
                    background: `rgba(0,0,0,${0.06 * row.opacity})`,
                    border: `1px solid ${BORDER_MD}`,
                    opacity: row.opacity,
                  }} />
                  <div className="absolute top-0 h-full" style={{ left: `${((row.window.center + 1) / 2) * 100}%`, width: 2, borderRadius: 1, background: row.color, opacity: row.opacity }} />
                </div>
                <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: TEXT_SECONDARY, width: 96, textAlign: "right" }}>
                  [{row.window.low.toFixed(2)}, {row.window.high.toFixed(2)}]
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Events timeline */}
        {events.length > 0 && (
          <div className="p-4" style={{ background: SURF, border: `1px solid ${BORDER}`, borderRadius: 8 }}>
            <div style={{ fontFamily: FONT_UI, fontSize: 10, fontWeight: 600, color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
              Events ({events.length})
            </div>
            <div className="space-y-2.5">
              {events.map((ev, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div style={{ fontFamily: FONT_MONO, fontSize: 9, fontWeight: 700, color: TEXT_MUTED, width: 32, textAlign: "right", paddingTop: 2, flexShrink: 0 }}>
                    T{ev.tick}
                  </div>
                  <div className="flex-1">
                    <div style={{ fontFamily: FONT_UI, fontSize: 12, fontWeight: 600, color: TEXT_PRIMARY, lineHeight: 1.5 }}>
                      {ev.headline}
                    </div>
                    <div style={{ fontFamily: FONT_UI, fontSize: 10, color: TEXT_MUTED, marginTop: 2 }}>
                      {ev.affected_agents.length} affected — {ev.type.replace("_", " ")}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Genuine shifts */}
        {genuineProbes.length > 0 && (
          <div>
            <div style={{ fontFamily: FONT_UI, fontSize: 10, fontWeight: 600, color: GENUINE, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
              Genuine Shifts
            </div>
            <div className="space-y-2.5">
              {genuineProbes.map((p) => {
                const agent = agents.find((a) => a.id === p.agent_id);
                return (
                  <div key={p.agent_id} onClick={() => selectAgent(p.agent_id)}
                    className="p-4 cursor-pointer transition-all"
                    style={{ background: SURF, border: `1px solid ${BORDER}`, borderRadius: 8, borderLeft: `3px solid ${GENUINE}` }}
                    onMouseEnter={(e) => e.currentTarget.style.background = RAISED}
                    onMouseLeave={(e) => e.currentTarget.style.background = SURF}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="rounded-full" style={{ width: 8, height: 8, background: GENUINE }} />
                      <span style={{ fontFamily: FONT_UI, fontSize: 13, fontWeight: 700, color: TEXT_PRIMARY }}>{agent?.name}</span>
                    </div>
                    <div className="space-y-1.5" style={{ fontFamily: FONT_UI, fontSize: 11, color: TEXT_SECONDARY, lineHeight: 1.5 }}>
                      <div><span style={{ color: TEXT_MUTED, fontWeight: 600 }}>Q: </span>{p.probe_question}</div>
                      <div><span style={{ color: TEXT_MUTED, fontWeight: 600 }}>A: </span>{p.probe_answer}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Surface compliance */}
        {surfaceProbes.length > 0 && (
          <div>
            <div style={{ fontFamily: FONT_UI, fontSize: 10, fontWeight: 600, color: COMPLIANT, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
              Surface Compliance
            </div>
            <div className="space-y-2.5">
              {surfaceProbes.map((p) => {
                const agent = agents.find((a) => a.id === p.agent_id);
                return (
                  <div key={p.agent_id} onClick={() => selectAgent(p.agent_id)}
                    className="p-4 cursor-pointer transition-all"
                    style={{ background: SURF, border: `1px solid ${BORDER}`, borderRadius: 8, borderLeft: `3px solid ${COMPLIANT}` }}
                    onMouseEnter={(e) => e.currentTarget.style.background = RAISED}
                    onMouseLeave={(e) => e.currentTarget.style.background = SURF}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="rounded-full" style={{ width: 8, height: 8, background: COMPLIANT }} />
                      <span style={{ fontFamily: FONT_UI, fontSize: 13, fontWeight: 700, color: TEXT_PRIMARY }}>{agent?.name}</span>
                    </div>
                    <div className="space-y-1.5" style={{ fontFamily: FONT_UI, fontSize: 11, color: TEXT_SECONDARY, lineHeight: 1.5 }}>
                      <div><span style={{ color: TEXT_MUTED, fontWeight: 600 }}>Q: </span>{p.probe_question}</div>
                      <div><span style={{ color: TEXT_MUTED, fontWeight: 600 }}>A: </span>{p.probe_answer}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex justify-center gap-3 pb-8">
          <button onClick={() => setScreen("playback")}
            className="px-5 py-2.5 transition-all"
            style={{ border: `1px solid ${BORDER_MD}`, borderRadius: 6, fontFamily: FONT_UI, fontSize: 12, fontWeight: 500, color: TEXT_SECONDARY, background: RAISED }}>
            Replay
          </button>
          <button onClick={reset}
            className="px-5 py-2.5 transition-all"
            style={{ background: ACTION, border: "none", borderRadius: 6, fontFamily: FONT_UI, fontSize: 12, fontWeight: 600, color: "white" }}>
            New Simulation
          </button>
        </div>
      </div>
    </div>
  );
}
