"use client";

import { useWebSocket } from "@/lib/ws";
import NetworkGraph from "@/components/network-graph";
import AgentPanel from "@/components/agent-panel";
import MessageComposer from "@/components/message-composer";
import StatsBar from "@/components/stats-bar";
import ConversationFeed from "@/components/conversation-feed";

export default function Home() {
  useWebSocket();

  return (
    <div className="flex flex-col h-screen bg-neutral-950 text-neutral-100">
      <StatsBar />
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 flex flex-col">
          <NetworkGraph />
          <ConversationFeed />
          <MessageComposer />
        </div>
        <AgentPanel />
      </div>
    </div>
  );
}
