"use client";

import { useRef, useEffect, useState } from "react";
import { useSimStore, useCurrentAgents } from "@/lib/store";
import { CARD, TEXT_PRIMARY, TEXT_MUTED } from "@/lib/colors";
import type { Conversation } from "@/lib/types";

const NOTABLE_THRESHOLD = 0.005;

type TickGroup = {
  tick: number;
  notable: Conversation[];
  quietCount: number;
};

export default function ConversationFeed() {
  const currentTick = useSimStore((s) => s.currentTick);
  const allAgents = useCurrentAgents();
  const ticks = useSimStore((s) => s.ticks);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [expandedTicks, setExpandedTicks] = useState<Set<number>>(new Set());

  const mono = { fontFamily: "'Courier New', monospace" } as const;
  const nameById = (id: string) =>
    id === "player" ? "You" : allAgents.find((a) => a.id === id)?.name?.split(" ")[0] ?? id.slice(0, 6);

  // Group conversations by tick, split into notable vs quiet
  const tickGroups: TickGroup[] = [];
  for (let t = 0; t <= currentTick && t < ticks.length; t++) {
    const convos = ticks[t].conversations ?? [];
    if (convos.length === 0) continue;

    const notable: Conversation[] = [];
    let quietCount = 0;

    for (const c of convos) {
      const maxDelta = Math.max(
        Math.abs(c.delta_on_listener ?? 0),
        Math.abs(c.delta_on_speaker ?? 0),
      );
      // Always show player injections
      if (c.from_id === "player" || maxDelta >= NOTABLE_THRESHOLD) {
        notable.push(c);
      } else {
        quietCount++;
      }
    }

    tickGroups.push({ tick: t, notable, quietCount });
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentTick]);

  function toggleExpand(tick: number) {
    setExpandedTicks((prev) => {
      const next = new Set(prev);
      if (next.has(tick)) next.delete(tick);
      else next.add(tick);
      return next;
    });
  }

  const totalConvos = tickGroups.reduce((s, g) => s + g.notable.length + g.quietCount, 0);

  if (totalConvos === 0) {
    return (
      <div
        className="w-64 flex items-center justify-center"
        style={{ background: CARD, borderLeft: `2px solid ${TEXT_PRIMARY}` }}
      >
        <p className="text-xs uppercase tracking-wider" style={{ color: TEXT_MUTED, ...mono }}>
          no conversations yet
        </p>
      </div>
    );
  }

  return (
    <div
      className="w-64 overflow-y-auto p-4"
      style={{ background: CARD, borderLeft: `2px solid ${TEXT_PRIMARY}` }}
    >
      <div className="text-xs uppercase tracking-wider mb-3" style={{ color: TEXT_MUTED, ...mono }}>
        notable exchanges
      </div>
      <div className="space-y-4">
        {tickGroups.map((group) => {
          const isExpanded = expandedTicks.has(group.tick);
          // Get all convos for this tick when expanded
          const allConvos = ticks[group.tick]?.conversations ?? [];

          return (
            <div key={group.tick}>
              {/* Tick header */}
              <div className="flex items-center gap-2 mb-2" style={{ color: TEXT_MUTED, fontSize: "9px", ...mono }}>
                <span className="font-bold">TICK {group.tick}</span>
                <span>{group.notable.length + group.quietCount} exchanges</span>
              </div>

              {/* Notable conversations */}
              <div className="space-y-3">
                {(isExpanded ? allConvos : group.notable).map((c, i) => {
                  const listenerDelta = c.delta_on_listener ?? 0;
                  const speakerDelta = c.delta_on_speaker ?? 0;
                  const isPlayer = c.from_id === "player";

                  return (
                    <div key={i} className="text-xs leading-relaxed" style={{ ...mono }}>
                      <div className="flex items-center gap-1.5 mb-0.5" style={{ color: TEXT_MUTED, fontSize: "9px" }}>
                        <span style={isPlayer ? { color: TEXT_PRIMARY, fontWeight: 700 } : undefined}>
                          {nameById(c.from_id)} → {nameById(c.to_id)}
                        </span>
                        {(Math.abs(listenerDelta) > 0.001 || Math.abs(speakerDelta) > 0.001) && (
                          <span style={{ color: TEXT_PRIMARY, fontWeight: 700 }}>
                            {listenerDelta > 0 ? "+" : ""}{listenerDelta.toFixed(3)}
                          </span>
                        )}
                      </div>
                      <div style={{ color: TEXT_PRIMARY }}>
                        <span style={{ fontWeight: 700 }}>{nameById(c.from_id)}:</span>{" "}
                        {c.speaker_message}
                      </div>
                      <div className="mt-0.5" style={{ color: TEXT_PRIMARY }}>
                        <span style={{ fontWeight: 700 }}>{nameById(c.to_id)}:</span>{" "}
                        {c.listener_response}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Quiet conversations toggle */}
              {group.quietCount > 0 && !isExpanded && (
                <button
                  onClick={() => toggleExpand(group.tick)}
                  className="text-xs mt-1.5 uppercase tracking-wider"
                  style={{ color: TEXT_MUTED, ...mono, fontSize: "9px" }}
                >
                  + {group.quietCount} quiet exchange{group.quietCount !== 1 ? "s" : ""}
                </button>
              )}
              {isExpanded && group.quietCount > 0 && (
                <button
                  onClick={() => toggleExpand(group.tick)}
                  className="text-xs mt-1.5 uppercase tracking-wider"
                  style={{ color: TEXT_MUTED, ...mono, fontSize: "9px" }}
                >
                  collapse
                </button>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
