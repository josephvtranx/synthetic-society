"use client";

import { useSimStore } from "@/lib/store";

export default function ConversationFeed() {
  const recentEvents = useSimStore((s) => s.state.recent_events);
  const activeConversations = useSimStore((s) => s.state.active_conversations);

  if (recentEvents.length === 0 && activeConversations.length === 0) {
    return null;
  }

  // Show active conversations first, then recent
  const convos = [...activeConversations, ...recentEvents.slice(0, -activeConversations.length || undefined)].slice(0, 10);

  return (
    <div className="border-t border-neutral-800 bg-neutral-950/80 max-h-48 overflow-y-auto">
      <div className="px-4 py-2">
        <h3 className="text-xs font-medium text-neutral-500 mb-2">Conversations</h3>
        <div className="space-y-2">
          {convos.map((c, i) => {
            const isActive = i < activeConversations.length;
            return (
              <div
                key={`${c.agent_a_id}-${c.agent_b_id}-${i}`}
                className={`text-xs border-l-2 pl-2 ${
                  isActive
                    ? "border-blue-500/50"
                    : "border-neutral-700"
                }`}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-neutral-300 font-medium">
                    {c.agent_a_name ?? c.agent_a_id}
                  </span>
                  <span className="text-neutral-600">&harr;</span>
                  <span className="text-neutral-300 font-medium">
                    {c.agent_b_name ?? c.agent_b_id}
                  </span>
                  {c.shift_a != null && (
                    <span className="text-neutral-600 ml-auto">
                      shifts: {c.shift_a.toFixed(3)}, {c.shift_b?.toFixed(3)}
                    </span>
                  )}
                </div>
                <p className="text-neutral-500 leading-snug">
                  &ldquo;{c.agent_a_statement}&rdquo;
                </p>
                <p className="text-neutral-500 leading-snug">
                  &ldquo;{c.agent_b_statement}&rdquo;
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
