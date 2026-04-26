"use client";

import { useRef, useEffect, useState, useMemo } from "react";
import { useSimStore, useCurrentAgents } from "@/lib/store";
import { CARD, TEXT_PRIMARY, TEXT_MUTED } from "@/lib/colors";
import type { Conversation, SimEvent } from "@/lib/types";

const NOTABLE_THRESHOLD = 0.005;
const REVEAL_INTERVAL_MS = 600; // reveal one conversation every 600ms

type FeedItem =
  | { kind: "tick_header"; tick: number; exchangeCount: number; netShift: number }
  | { kind: "event"; event: SimEvent }
  | { kind: "conversation"; conversation: Conversation; isPlayer: boolean; rank: number }
  | { kind: "quiet_toggle"; tick: number; count: number };

export default function ConversationFeed() {
  const currentTick = useSimStore((s) => s.currentTick);
  const allAgents = useCurrentAgents();
  const ticks = useSimStore((s) => s.ticks);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [expandedTicks, setExpandedTicks] = useState<Set<number>>(new Set());

  // Staggered reveal: track how many items of the current tick are visible
  const [revealedCount, setRevealedCount] = useState(0);
  const lastRevealTick = useRef(-1);

  const mono = { fontFamily: "'Courier New', monospace" } as const;
  const nameById = (id: string) =>
    id === "player" ? "You" : allAgents.find((a) => a.id === id)?.name?.split(" ")[0] ?? id.slice(0, 6);

  // Build feed items
  const feedItems: FeedItem[] = useMemo(() => {
    const items: FeedItem[] = [];
    for (let t = 0; t <= currentTick && t < ticks.length; t++) {
      const tick = ticks[t];
      const convos = tick.conversations ?? [];
      if (convos.length === 0 && !tick.event) continue;

      // Compute net shift for this tick
      const shifts = tick.shifts ?? [];
      const netShift = shifts.reduce((sum, s) => sum + s.delta, 0);

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

      items.push({ kind: "tick_header", tick: t, exchangeCount: convos.length, netShift });

      if (tick.event) {
        items.push({ kind: "event", event: tick.event });
      }

      const isExpanded = expandedTicks.has(t);
      const displayConvos = isExpanded ? convos : notable;

      // Sort by impact (biggest shift first) so most interesting appear first
      const sorted = [...displayConvos].sort((a, b) => {
        const aMax = Math.max(Math.abs(a.delta_on_listener ?? 0), Math.abs(a.delta_on_speaker ?? 0));
        const bMax = Math.max(Math.abs(b.delta_on_listener ?? 0), Math.abs(b.delta_on_speaker ?? 0));
        // Player convos always first
        if (a.from_id === "player" && b.from_id !== "player") return -1;
        if (b.from_id === "player" && a.from_id !== "player") return 1;
        return bMax - aMax;
      });

      for (let i = 0; i < sorted.length; i++) {
        const c = sorted[i];
        items.push({ kind: "conversation", conversation: c, isPlayer: c.from_id === "player", rank: i });
      }

      if (quietCount > 0) {
        items.push({ kind: "quiet_toggle", tick: t, count: isExpanded ? 0 : quietCount });
      }
    }
    return items;
  }, [currentTick, ticks, expandedTicks, allAgents]);

  // Count items in the current (latest) tick for staggered reveal
  const currentTickItemCount = useMemo(() => {
    let count = 0;
    for (let i = feedItems.length - 1; i >= 0; i--) {
      const item = feedItems[i];
      if (item.kind === "tick_header") break;
      count++;
    }
    return count;
  }, [feedItems]);

  // Reset reveal counter when tick changes, then gradually reveal
  useEffect(() => {
    if (currentTick !== lastRevealTick.current) {
      lastRevealTick.current = currentTick;
      setRevealedCount(0);
    }
  }, [currentTick]);

  useEffect(() => {
    if (revealedCount < currentTickItemCount) {
      const timer = setTimeout(() => {
        setRevealedCount((c) => c + 1);
      }, REVEAL_INTERVAL_MS);
      return () => clearTimeout(timer);
    }
  }, [revealedCount, currentTickItemCount]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentTick, revealedCount]);

  function toggleExpand(tick: number) {
    setExpandedTicks((prev) => {
      const next = new Set(prev);
      if (next.has(tick)) next.delete(tick);
      else next.add(tick);
      return next;
    });
  }

  // Determine which items are in the latest tick (for staggered reveal)
  let latestTickStart = feedItems.length;
  for (let i = feedItems.length - 1; i >= 0; i--) {
    if (feedItems[i].kind === "tick_header") {
      latestTickStart = i;
      break;
    }
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
          // Staggered reveal: hide items in the latest tick beyond the reveal count
          const isInLatestTick = idx > latestTickStart;
          const latestTickIdx = idx - latestTickStart - 1;
          if (isInLatestTick && latestTickIdx >= revealedCount) {
            return null;
          }
          // Fade-in for newly revealed items
          const isNewlyRevealed = isInLatestTick && latestTickIdx === revealedCount - 1;

          if (item.kind === "tick_header") {
            const shiftLabel = Math.abs(item.netShift) > 0.005
              ? ` | net ${item.netShift > 0 ? "+" : ""}${item.netShift.toFixed(3)}`
              : "";
            return (
              <div key={`th-${item.tick}`} className="flex items-center gap-2 mt-3 first:mt-0"
                style={{ color: TEXT_MUTED, fontSize: "9px", ...mono }}>
                <div className="flex-1 h-px" style={{ background: "rgba(0,0,0,0.1)" }} />
                <span className="font-bold">TICK {item.tick}</span>
                <span>{item.exchangeCount} exchanges{shiftLabel}</span>
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
                  animation: isNewlyRevealed ? "feedFadeIn 0.4s ease-out" : undefined,
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
            const maxDelta = Math.max(Math.abs(listenerDelta), Math.abs(speakerDelta));
            const isBigShift = maxDelta > 0.02;
            const isHugeShift = maxDelta > 0.05;

            return (
              <div key={`c-${idx}`}
                className="text-xs leading-relaxed py-1.5"
                style={{
                  ...mono,
                  borderLeft: isHugeShift
                    ? `4px solid ${TEXT_PRIMARY}`
                    : isBigShift
                    ? `3px solid ${TEXT_PRIMARY}`
                    : `1px solid rgba(0,0,0,0.08)`,
                  paddingLeft: 8,
                  background: isHugeShift ? "rgba(0,0,0,0.04)" : "transparent",
                  animation: isNewlyRevealed ? "feedFadeIn 0.4s ease-out" : undefined,
                }}>
                <div className="flex items-center gap-1.5 mb-0.5" style={{ color: TEXT_MUTED, fontSize: "9px" }}>
                  <span style={item.isPlayer ? { color: TEXT_PRIMARY, fontWeight: 700 } : undefined}>
                    {nameById(c.from_id)} → {nameById(c.to_id)}
                  </span>
                  {Math.abs(listenerDelta) > 0.001 && (
                    <span style={{
                      color: TEXT_PRIMARY,
                      fontWeight: 700,
                      background: isBigShift ? "rgba(0,0,0,0.08)" : "transparent",
                      padding: isBigShift ? "0 3px" : 0,
                    }}>
                      {listenerDelta > 0 ? "+" : ""}{listenerDelta.toFixed(3)}
                    </span>
                  )}
                  {isHugeShift && (
                    <span style={{ color: TEXT_PRIMARY, fontWeight: 700, fontSize: "8px", letterSpacing: "0.1em" }}>
                      BIG SHIFT
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
      <style jsx global>{`
        @keyframes feedFadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
