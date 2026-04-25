"use client";

import { useRef, useEffect } from "react";
import { useSimStore, useCurrentAgents } from "@/lib/store";
import { CARD, TEXT_PRIMARY, TEXT_MUTED } from "@/lib/colors";
import type { Conversation } from "@/lib/types";

export default function ConversationFeed() {
  const timeline = useSimStore((s) => s.timeline);
  const currentTick = useSimStore((s) => s.currentTick);
  const allAgents = useCurrentAgents();
  const bottomRef = useRef<HTMLDivElement>(null);

  const mono = { fontFamily: "'Courier New', monospace" } as const;
  const nameById = (id: string) =>
    id === "player" ? "You" : allAgents.find((a) => a.id === id)?.name?.split(" ")[0] ?? id.slice(0, 6);

  // Gather conversations up to current tick
  const conversations: Conversation[] = [];
  if (timeline) {
    for (let t = 0; t <= currentTick && t < timeline.ticks.length; t++) {
      const tick = timeline.ticks[t];
      if (tick.conversations) {
        conversations.push(...tick.conversations);
      }
    }
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentTick]);

  if (conversations.length === 0) {
    return (
      <div
        className="w-64 flex items-center justify-center"
        style={{ background: CARD, borderLeft: `2px solid ${TEXT_PRIMARY}` }}
      >
        <p
          className="text-xs uppercase tracking-wider"
          style={{ color: TEXT_MUTED, ...mono }}
        >
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
      <div
        className="text-xs uppercase tracking-wider mb-3"
        style={{ color: TEXT_MUTED, ...mono }}
      >
        conversation log
      </div>
      <div className="space-y-4">
        {conversations.map((c, i) => (
          <div key={i} className="text-xs leading-relaxed" style={{ ...mono }}>
            <div
              className="flex items-center gap-2 mb-1"
              style={{ color: TEXT_MUTED, fontSize: "9px" }}
            >
              <span>TICK {c.tick}</span>
              <span>
                {nameById(c.from_id)} → {nameById(c.to_id)}
              </span>
            </div>
            <div style={{ color: TEXT_PRIMARY }}>
              <span style={{ fontWeight: 700 }}>{nameById(c.from_id)}:</span>{" "}
              {c.speaker_message}
            </div>
            <div className="mt-1" style={{ color: TEXT_PRIMARY }}>
              <span style={{ fontWeight: 700 }}>{nameById(c.to_id)}:</span>{" "}
              {c.listener_response}
            </div>
            {c.shift !== 0 && (
              <div className="mt-1" style={{ color: TEXT_MUTED }}>
                shift: {c.shift > 0 ? "+" : ""}
                {c.shift.toFixed(3)}
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
