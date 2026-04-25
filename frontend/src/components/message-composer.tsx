"use client";

import { useState } from "react";
import { useSimStore, useTick } from "@/lib/store";
import { sendAction } from "@/lib/ws";

const MAX_TICKS = 5;

export default function MessageComposer() {
  const [message, setMessage] = useState("");
  const selectedAgentId = useSimStore((s) => s.selectedAgentId);
  const agents = useSimStore((s) => s.state.agents);
  const tick = useTick();

  const selectedAgent = selectedAgentId
    ? agents.find((a) => a.id === selectedAgentId)
    : null;

  const remaining = MAX_TICKS - tick;

  function handleSend() {
    if (!message.trim() || remaining <= 0) return;

    sendAction({
      message: message.trim(),
      target: selectedAgentId ?? "all",
    });

    setMessage("");
  }

  return (
    <div className="border-t border-neutral-800 bg-neutral-950 p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs text-neutral-500">
          Target:{" "}
          <span className="text-neutral-300">
            {selectedAgent ? selectedAgent.name : "All agents"}
          </span>
        </span>
        <span className="text-xs text-neutral-600 ml-auto">
          {remaining} message{remaining !== 1 ? "s" : ""} remaining
        </span>
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder={
            remaining > 0
              ? "Craft your message to shift opinions..."
              : "No messages remaining"
          }
          disabled={remaining <= 0}
          className="flex-1 bg-neutral-900 border border-neutral-700 rounded px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:border-neutral-500 disabled:opacity-40"
        />
        <button
          onClick={handleSend}
          disabled={!message.trim() || remaining <= 0}
          className="px-4 py-2 bg-neutral-200 text-neutral-900 text-sm font-medium rounded hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          Send
        </button>
      </div>
    </div>
  );
}
