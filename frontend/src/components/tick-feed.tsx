"use client";

import { useRef, useEffect, useState } from "react";
import { useSimStore, useTotalTicks, useCurrentAgents } from "@/lib/store";
import { SURF, BORDER, TEXT_PRIMARY, TEXT_SECONDARY, TEXT_MUTED, GENUINE, COMPLIANT, AGAINST, ACTION, FONT_UI, FONT_MONO } from "@/lib/colors";

export default function TickFeed() {
  const ticks = useSimStore((s) => s.ticks);
  const currentTick = useSimStore((s) => s.currentTick);
  const setCurrentTick = useSimStore((s) => s.setCurrentTick);
  const setPlaying = useSimStore((s) => s.setPlaying);
  const totalTicks = useTotalTicks();
  const allAgents = useCurrentAgents();
  const containerRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [expandedTicks, setExpandedTicks] = useState<Set<number>>(new Set());

  // Look up all tick-0 agents as a stable name map (positions change but names don't)
  const tick0Agents = useSimStore((s) => s.ticks[0]?.agents ?? []);
  const nameById = (id: string) => {
    if (id === "player") return "You";
    const agent = tick0Agents.find((a) => a.id === id) ?? allAgents.find((a) => a.id === id);
    return agent?.name?.split(" ")[0] ?? id.slice(0, 6);
  };

  // Scroll active row into view
  useEffect(() => {
    const container = containerRef.current;
    const row = rowRefs.current.get(currentTick);
    if (!container || !row) return;
    const containerRect = container.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const offset = rowRect.top - containerRect.top - containerRect.height / 3;
    container.scrollTop += offset;
  }, [currentTick]);

  function handleClick(tick: number) {
    setCurrentTick(tick);
    setPlaying(false);
  }

  function toggleExpand(tickIdx: number, e: React.MouseEvent) {
    e.stopPropagation();
    setExpandedTicks((prev) => {
      const next = new Set(prev);
      if (next.has(tickIdx)) next.delete(tickIdx);
      else next.add(tickIdx);
      return next;
    });
  }

  const VISIBLE_COUNT = 4;

  return (
    <div className="w-[220px] flex-shrink-0 flex flex-col" style={{ background: SURF, borderRight: `1px solid ${BORDER}` }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 py-3" style={{ height: 44, borderBottom: `1px solid ${BORDER}` }}>
        <span style={{ fontFamily: FONT_UI, fontSize: 11, fontWeight: 600, color: TEXT_SECONDARY, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Tick Log
        </span>
        <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: TEXT_MUTED, background: "rgba(0,0,0,0.05)", padding: "2px 6px", borderRadius: 3 }}>
          {totalTicks}
        </span>
      </div>

      {/* Body */}
      <div ref={containerRef} className="flex-1 overflow-y-auto py-1.5">
        {ticks.map((tick, idx) => {
          const isCurrent = idx === currentTick;
          const conversations = tick.conversations ?? [];
          const shifts = tick.shifts ?? [];
          const event = tick.event;
          const isExpanded = expandedTicks.has(idx);

          // Build conversation entries (separate from event)
          const convEntries: { desc: string; delta: number }[] = [];

          for (const c of conversations) {
            const listenerDelta = c.delta_on_listener ?? 0;
            const speakerDelta = c.delta_on_speaker ?? 0;
            const isPlayer = c.from_id === "player";
            const fromName = nameById(c.from_id);
            const toName = nameById(c.to_id);

            if (Math.abs(listenerDelta) > 0.003 || isPlayer) {
              convEntries.push({ desc: `${fromName} → ${toName}`, delta: listenerDelta });
            }
            if (Math.abs(speakerDelta) > 0.003) {
              convEntries.push({ desc: `${toName} → ${fromName}`, delta: speakerDelta });
            }
          }

          const visibleEntries = isExpanded ? convEntries : convEntries.slice(0, VISIBLE_COUNT);
          const hiddenCount = convEntries.length - VISIBLE_COUNT;

          // Note for this tick
          let note = "";
          if (idx === 0) note = "Initial state";
          else if (shifts.length > 0) note = `${shifts.length} shift${shifts.length > 1 ? "s" : ""}`;
          else note = "No movement";

          return (
            <div
              key={idx}
              ref={(el) => { if (el) rowRefs.current.set(idx, el); }}
              onClick={() => handleClick(idx)}
              className="cursor-pointer transition-colors"
              style={{
                padding: "9px 14px",
                borderLeft: `2px solid ${isCurrent ? ACTION : "transparent"}`,
                background: isCurrent ? "rgba(0,0,0,0.03)" : "transparent",
              }}
            >
              {/* Tick header */}
              <div className="flex items-center gap-2 mb-0.5">
                <span style={{ fontFamily: FONT_MONO, fontSize: 9, fontWeight: 700, color: isCurrent ? ACTION : TEXT_MUTED }}>
                  T{idx}
                </span>
                <span style={{ fontFamily: FONT_UI, fontSize: 10, color: TEXT_SECONDARY }}>
                  {note}
                </span>
              </div>

              {/* Breaking event — separate block */}
              {event && (
                <div className="mb-1.5 mt-1" style={{
                  marginLeft: 2,
                  padding: "5px 8px",
                  borderRadius: 4,
                  background: "rgba(0,0,0,0.05)",
                  borderLeft: `2px solid ${AGAINST}`,
                }}>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span style={{ fontFamily: FONT_MONO, fontSize: 8, fontWeight: 700, color: AGAINST, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      {event.type.replace("_", " ")}
                    </span>
                  </div>
                  <div style={{
                    fontFamily: FONT_UI, fontSize: 10, fontWeight: 500,
                    color: isCurrent ? TEXT_PRIMARY : TEXT_SECONDARY,
                    lineHeight: 1.4,
                  }}>
                    {event.headline}
                  </div>
                  {event.affected_agents.length > 0 && (
                    <div style={{ fontFamily: FONT_MONO, fontSize: 8, color: TEXT_MUTED, marginTop: 2 }}>
                      {event.affected_agents.length} affected
                    </div>
                  )}
                </div>
              )}

              {/* Conversation entries */}
              {visibleEntries.map((ev, i) => (
                <div key={i} className="flex items-center gap-1.5 mb-0.5" style={{ marginLeft: 6 }}>
                  <div className="rounded-full flex-shrink-0" style={{
                    width: 6, height: 6,
                    background: TEXT_MUTED,
                  }} />
                  <span className="flex-1 truncate" style={{
                    fontFamily: FONT_UI, fontSize: 10,
                    color: isCurrent ? TEXT_SECONDARY : TEXT_MUTED,
                  }}>
                    {ev.desc}
                  </span>
                  {ev.delta !== 0 && (
                    <span style={{
                      fontFamily: FONT_MONO, fontSize: 9, fontWeight: 600,
                      color: ev.delta > 0 ? GENUINE : AGAINST,
                    }}>
                      {ev.delta > 0 ? "+" : ""}{ev.delta.toFixed(3)}
                    </span>
                  )}
                </div>
              ))}

              {/* Expandable "+X more" */}
              {hiddenCount > 0 && (
                <button
                  onClick={(e) => toggleExpand(idx, e)}
                  style={{
                    fontFamily: FONT_UI, fontSize: 9, color: ACTION, marginLeft: 6,
                    background: "none", border: "none", cursor: "pointer",
                    padding: "2px 0",
                  }}
                >
                  {isExpanded ? "show less ▲" : `+${hiddenCount} more ▼`}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
