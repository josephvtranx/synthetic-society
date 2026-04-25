"use client";

import { useState } from "react";
import { useSimStore } from "@/lib/store";
import { sendBroadcast } from "@/lib/ws";

export default function MessageComposer() {
  const [message, setMessage] = useState("");
  const selectedAgentId = useSimStore((s) => s.selectedAgentId);
  const agents = useSimStore((s) => s.state.agents);
  const isRunning = useSimStore((s) => s.state.is_running);

  const selectedAgent = selectedAgentId
    ? agents.find((a) => a.id === selectedAgentId)
    : null;

  function handleSend() {
    if (!message.trim()) return;
    sendBroadcast(message.trim(), selectedAgentId ?? "all");
    setMessage("");
  }

  if (agents.length === 0) return null;

  return (
    <div className="border-t border-neutral-800 bg-neutral-950 p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs text-neutral-500">
          Target:{" "}
          <span className="text-neutral-300">
            {selectedAgent ? selectedAgent.name : "All agents"}
          </span>
        </span>
        {isRunning && (
          <span className="text-xs text-green-600 ml-auto">
            Messages will be processed next tick
          </span>
        )}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Craft your message to shift opinions..."
          className="flex-1 bg-neutral-900 border border-neutral-700 rounded px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:border-neutral-500"
        />
        <button
          onClick={handleSend}
          disabled={!message.trim()}
          className="px-4 py-2 bg-neutral-200 text-neutral-900 text-sm font-medium rounded hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          Send
        </button>
      </div>
    </div>
  );
}
