"use client";

import { useSimStore } from "@/lib/store";
import { BG } from "@/lib/colors";
import SetupScreen from "@/components/setup-screen";
import NetworkGraph from "@/components/network-graph";
import AgentPanel from "@/components/agent-panel";
import PlaybackControls from "@/components/playback-controls";
import StatsBar from "@/components/stats-bar";
import DebriefScreen from "@/components/debrief-screen";
import TickFeed from "@/components/tick-feed";

export default function Home() {
  const screen = useSimStore((s) => s.screen);

  if (screen === "setup") {
    return (
      <div className="flex flex-col h-screen" style={{ background: BG }}>
        <SetupScreen />
      </div>
    );
  }

  if (screen === "debrief") {
    return (
      <div className="flex flex-col h-screen" style={{ background: BG }}>
        <StatsBar />
        <div className="flex flex-1 overflow-hidden">
          <DebriefScreen />
          <AgentPanel />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen" style={{ background: BG }}>
      <StatsBar />
      <div className="flex flex-1 overflow-hidden">
        <TickFeed />
        <div className="flex-1 flex flex-col">
          <NetworkGraph />
          <PlaybackControls />
        </div>
        <AgentPanel />
      </div>
    </div>
  );
}
