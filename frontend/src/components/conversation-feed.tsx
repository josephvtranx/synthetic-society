"use client";

import { useRef, useEffect, useState } from "react";
import { useSimStore, useCurrentAgents } from "@/lib/store";
import { CARD, TEXT_PRIMARY, TEXT_MUTED } from "@/lib/colors";
import type { Conversation, SimEvent } from "@/lib/types";

const NOTABLE_THRESHOLD = 0.005;

type FeedItem =
  | { kind: "tick_header"; tick: number; exchangeCount: number }
  | { kind: "event"; event: SimEvent }
  | { kind: "conversation"; conversation: Conversation; isPlayer: boolean }
  | { kind: "quiet_toggle"; tick: number; count: number };

export default function ConversationFeed() {
  const currentTick = useSimStore((s) => s.currentTick);
  const allAgents = useCurrentAgents();
  const ticks = useSimStore((s) => s.ticks);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [expandedTicks, setExpandedTicks] = useState<Set<number>>(new Set());

  const mono = { fontFamily: "'Courier New', monospace" } as const;
  const nameById = (id: string) =>
    id === "player" ? "You" : allAgents.find((a) => a.id === id)?.name?.split(" ")[0] ?? id.slice(0, 6);

  // Build feed items
  const feedItems: FeedItem[] = [];
  for (let t = 0; t <= currentTick && t < ticks.length; t++) {
    const tick = ticks[t];
    const convos = tick.conversations ?? [];
    if (convos.length === 0 && !tick.event) continue;

    const notable: Conversation[] = [];
    let quietCount = 0;

    for (const c of convos) {
      const maxDelta = Math.max(
        Math.abs(c.delta_on_listener ?? 0),
        Math.abs(c.delta_on_speaker ?? 0),
      );
      if (c.from_id === "player" || maxDelta >= NOTABLE_THRESHOLD) {
        notable.push(c);
      } else {
        quietCount++;
      }
    }

    feedItems.push({ kind: "tick_header", tick: t, exchangeCount: convos.length });

    // Show event FIRST if there is one — it's the big news
    if (tick.event) {
      feedItems.push({ kind: "event", event: tick.event });
    }

    const isExpanded = expandedTicks.has(t);
    const displayConvos = isExpanded ? convos : notable;
    for (const c of displayConvos) {
      feedItems.push({ kind: "conversation", conversation: c, isPlayer: c.from_id === "player" });
    }

    if (quietCount > 0) {
      feedItems.push({ kind: "quiet_toggle", tick: t, count: isExpanded ? 0 : quietCount });
    }
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

  if (feedItems.length === 0) {
    return (
      <div
        className="w-72 flex items-center justify-center"
        style={{ background: CARD, borderLeft: `2px solid ${TEXT_PRIMARY}` }}
      >
        <p className="text-xs uppercase tracking-wider" style={{ color: TEXT_MUTED, ...mono }}>
          waiting for first tick...
        </p>
      </div>
    );
  }

  return (
    <div
      className="w-72 overflow-y-auto p-4"
      style={{ background: CARD, borderLeft: `2px solid ${TEXT_PRIMARY}` }}
    >
      <div className="text-xs uppercase tracking-wider mb-3 font-bold" style={{ color: TEXT_PRIMARY, ...mono }}>
        the wire
      </div>
      <div className="space-y-2">
        {feedItems.map((item, idx) => {
          if (item.kind === "tick_header") {
            return (
              <div key={`th-${item.tick}`} className="flex items-center gap-2 mt-3 first:mt-0"
                style={{ color: TEXT_MUTED, fontSize: "9px", ...mono }}>
                <div className="flex-1 h-px" style={{ background: "rgba(0,0,0,0.1)" }} />
                <span className="font-bold">TICK {item.tick}</span>
                <span>{item.exchangeCount} exchanges</span>
                <div className="flex-1 h-px" style={{ background: "rgba(0,0,0,0.1)" }} />
              </div>
            );
          }

          if (item.kind === "event") {
            return (
              <div key={`ev-${item.event.tick}`}
                className="px-3 py-2.5 my-2"
                style={{
                  background: TEXT_PRIMARY,
                  color: CARD,
                  ...mono,
                }}>
                <div className="flex items-center gap-1.5 mb-1" style={{ fontSize: "9px", letterSpacing: "0.1em" }}>
                  <span style={{ fontWeight: 700 }}>BREAKING</span>
                  <span style={{ opacity: 0.6 }}>|</span>
                  <span style={{ opacity: 0.6, textTransform: "uppercase" }}>{item.event.type.replace("_", " ")}</span>
                </div>
                <div className="text-xs leading-relaxed font-bold">
                  {item.event.headline}
                </div>
                {item.event.affected_agents.length > 0 && (
                  <div className="mt-1" style={{ fontSize: "9px", opacity: 0.6 }}>
                    {item.event.affected_agents.length} agent{item.event.affected_agents.length !== 1 ? "s" : ""} affected
                  </div>
                )}
              </div>
            );
          }

          if (item.kind === "conversation") {
            const c = item.conversation;
            const listenerDelta = c.delta_on_listener ?? 0;
            const speakerDelta = c.delta_on_speaker ?? 0;
            const bigShift = Math.max(Math.abs(listenerDelta), Math.abs(speakerDelta)) > 0.02;

            return (
              <div key={`c-${idx}`}
                className="text-xs leading-relaxed py-1.5"
                style={{
                  ...mono,
                  borderLeft: bigShift ? `3px solid ${TEXT_PRIMARY}` : `1px solid rgba(0,0,0,0.08)`,
                  paddingLeft: 8,
                }}>
                <div className="flex items-center gap-1.5 mb-0.5" style={{ color: TEXT_MUTED, fontSize: "9px" }}>
                  <span style={item.isPlayer ? { color: TEXT_PRIMARY, fontWeight: 700 } : undefined}>
                    {nameById(c.from_id)} → {nameById(c.to_id)}
                  </span>
                  {Math.abs(listenerDelta) > 0.001 && (
                    <span style={{
                      color: TEXT_PRIMARY,
                      fontWeight: 700,
                      background: bigShift ? "rgba(0,0,0,0.08)" : "transparent",
                      padding: bigShift ? "0 3px" : 0,
                    }}>
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
          }

          if (item.kind === "quiet_toggle" && item.count > 0) {
            return (
              <button key={`qt-${item.tick}`}
                onClick={() => toggleExpand(item.tick)}
                className="text-xs uppercase tracking-wider block"
                style={{ color: TEXT_MUTED, ...mono, fontSize: "9px" }}>
                + {item.count} quiet exchange{item.count !== 1 ? "s" : ""}
              </button>
            );
          }

          if (item.kind === "quiet_toggle" && item.count === 0) {
            return (
              <button key={`qt-${item.tick}`}
                onClick={() => toggleExpand(item.tick)}
                className="text-xs uppercase tracking-wider block"
                style={{ color: TEXT_MUTED, ...mono, fontSize: "9px" }}>
                collapse
              </button>
            );
          }

          return null;
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
