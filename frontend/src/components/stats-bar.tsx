"use client";

import { useState } from "react";
import { useSimStore, useCurrentAgents, useOvertonWindow, useInfluenceRemaining, useTotalTicks } from "@/lib/store";
import { SURF, BORDER, BORDER_MD, TEXT_PRIMARY, TEXT_SECONDARY, TEXT_MUTED, GENUINE, COMPLIANT, AGAINST, ACTION, FONT_UI, FONT_MONO, positionToColor } from "@/lib/colors";
import { INFLUENCE_BUDGET } from "@/lib/types";

function Tooltip({ content, children }: { content: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-flex items-center"
      onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      {show && (
        <span className="absolute top-[calc(100%+6px)] left-1/2 -translate-x-1/2 z-50 pointer-events-none"
          style={{ background: SURF, border: `1px solid ${BORDER_MD}`, color: TEXT_PRIMARY, padding: "6px 10px", borderRadius: 5, fontSize: 11, fontFamily: FONT_UI, lineHeight: 1.5, whiteSpace: "nowrap", boxShadow: "0 6px 20px rgba(0,0,0,0.08)" }}>
          {content}
        </span>
      )}
    </span>
  );
}

export default function StatsBar() {
  const screen = useSimStore((s) => s.screen);
  const currentTick = useSimStore((s) => s.currentTick);
  const topic = useSimStore((s) => s.topic);
  const agents = useCurrentAgents();
  const overton = useOvertonWindow();
  const influenceRemaining = useInfluenceRemaining();
  const totalTicks = useTotalTicks();
  const ticks = useSimStore((s) => s.ticks);
  const [showLegend, setShowLegend] = useState(false);

  if (screen === "setup") return null;

  const mean = agents.length > 0 ? agents.reduce((sum, a) => sum + a.position, 0) / agents.length : 0;
  const totalShifts = ticks.reduce((sum, t) => sum + (t.shifts?.length ?? 0), 0);
  const truncatedTopic = topic.length > 30 ? topic.slice(0, 30) + "..." : topic;

  return (
    <div style={{ background: SURF, borderBottom: `1px solid ${BORDER}` }}>
      <div className="px-5 flex items-center gap-6" style={{ height: 48 }}>
        {/* Logo */}
        <span style={{ fontFamily: FONT_UI, fontSize: 13, fontWeight: 700, color: TEXT_PRIMARY, letterSpacing: "0.02em" }}>
          Synthetic Society
        </span>

        <div style={{ width: 1, height: 20, background: BORDER }} />

        {/* Stats */}
        <div className="flex items-center gap-5">
          <span style={{ fontFamily: FONT_UI, fontSize: 11, color: TEXT_SECONDARY }}>
            Tick <span style={{ fontFamily: FONT_MONO, fontWeight: 600, color: TEXT_PRIMARY }}>{currentTick} / {totalTicks}</span>
          </span>
          <span style={{ fontFamily: FONT_UI, fontSize: 11, color: TEXT_SECONDARY }}>
            Mean belief <span style={{ fontFamily: FONT_MONO, fontWeight: 600, color: TEXT_PRIMARY }}>{mean >= 0 ? "+" : ""}{mean.toFixed(2)}</span>
          </span>
          <span style={{ fontFamily: FONT_UI, fontSize: 11, color: TEXT_SECONDARY }}>
            Shifts so far <span style={{ fontFamily: FONT_MONO, fontWeight: 600, color: TEXT_PRIMARY }}>{totalShifts}</span>
          </span>

          {/* Mini opinion range */}
          {overton && (
            <Tooltip content="Overton window: the range of beliefs held by the middle 70% of agents">
              <span className="flex items-center gap-2" style={{ fontFamily: FONT_UI, fontSize: 11, color: TEXT_SECONDARY, cursor: "help", borderBottom: `1px dashed ${TEXT_MUTED}` }}>
                Opinion range
                <span className="relative inline-block" style={{ width: 80, height: 6, borderRadius: 3, background: "rgba(0,0,0,0.06)" }}>
                  {/* Overton band */}
                  <span className="absolute top-0 bottom-0 transition-all duration-500" style={{
                    left: `${((overton.low + 1) / 2) * 100}%`,
                    width: `${(overton.width / 2) * 100}%`,
                    background: "rgba(0,0,0,0.12)",
                    border: `1px solid ${BORDER_MD}`,
                    borderRadius: 2,
                  }} />
                  {/* Agent dots */}
                  {agents.map((a) => (
                    <span key={a.id} className="absolute top-0 transition-all duration-500" style={{
                      left: `${((a.position + 1) / 2) * 100}%`,
                      width: 2, height: 4, borderRadius: 1,
                      background: positionToColor(a.position), opacity: 0.7,
                      transform: "translateX(-1px)",
                    }} />
                  ))}
                </span>
              </span>
            </Tooltip>
          )}
        </div>

        <div className="ml-auto flex items-center gap-3">
          {/* IP gauge */}
          <Tooltip content="Influence Points remaining">
            <span className="flex items-center gap-2" style={{ fontFamily: FONT_UI, fontSize: 11, color: TEXT_SECONDARY }}>
              IP
              <span className="relative inline-block" style={{ width: 56, height: 5, borderRadius: 3, background: "rgba(0,0,0,0.06)" }}>
                <span className="absolute inset-0 rounded-full transition-all duration-300" style={{
                  width: `${(influenceRemaining / INFLUENCE_BUDGET) * 100}%`,
                  background: ACTION,
                  borderRadius: 3,
                }} />
              </span>
              <span style={{ fontFamily: FONT_MONO, fontSize: 11, fontWeight: 600, color: TEXT_PRIMARY }}>{influenceRemaining}</span>
            </span>
          </Tooltip>

          {/* Legend toggle */}
          <button
            onClick={() => setShowLegend(!showLegend)}
            style={{ border: `1px solid ${BORDER}`, borderRadius: 5, padding: "3px 10px", fontFamily: FONT_UI, fontSize: 11, color: TEXT_SECONDARY, background: "transparent" }}
          >
            Legend {showLegend ? "▲" : "▼"}
          </button>

          {/* Topic pill */}
          <span className="truncate" style={{ maxWidth: 220, border: `1px solid ${BORDER}`, borderRadius: 5, padding: "3px 10px", fontFamily: FONT_UI, fontSize: 11, color: TEXT_SECONDARY }}>
            {truncatedTopic}
          </span>
        </div>
      </div>

      {/* Legend panel */}
      {showLegend && (
        <div className="flex flex-wrap gap-7 px-5 py-3" style={{ borderTop: `1px solid ${BORDER}` }}>
          {[
            { color: GENUINE, label: "Genuine", desc: "Agent processed the argument and actually changed their mind" },
            { color: COMPLIANT, label: "Surface Compliance", desc: "Agent moved due to social pressure without understanding the argument" },
            { color: AGAINST, label: "Resistant", desc: "Agent pushed back — belief became more entrenched" },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-2">
              <div className="rounded-full" style={{ width: 10, height: 10, background: item.color }} />
              <span style={{ fontFamily: FONT_UI, fontSize: 11, fontWeight: 600, color: TEXT_PRIMARY }}>{item.label}</span>
              <span style={{ fontFamily: FONT_UI, fontSize: 10, color: TEXT_MUTED }}>{item.desc}</span>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <div className="rounded-full" style={{ width: 10, height: 10, border: `2px solid ${GENUINE}`, background: "transparent" }} />
            <span style={{ fontFamily: FONT_UI, fontSize: 11, fontWeight: 600, color: TEXT_PRIMARY }}>Target</span>
            <span style={{ fontFamily: FONT_UI, fontSize: 10, color: TEXT_MUTED }}>The agent you injected your argument into</span>
          </div>
        </div>
      )}
    </div>
  );
}
