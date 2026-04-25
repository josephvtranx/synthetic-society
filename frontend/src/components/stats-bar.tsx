"use client";

import { useStats, useTick, useSimStore } from "@/lib/store";

export default function StatsBar() {
  const stats = useStats();
  const tick = useTick();
  const connected = useSimStore((s) => s.connected);
  const gameMode = useSimStore((s) => s.state.game_mode);
  const winProgress = useSimStore((s) => s.state.win_progress);

  return (
    <div className="border-b border-neutral-800 bg-neutral-950 px-4 py-2 flex items-center gap-6 text-xs">
      <div className="flex items-center gap-2">
        <div
          className={`w-2 h-2 rounded-full ${connected ? "bg-green-500" : "bg-neutral-600"}`}
        />
        <span className="text-neutral-400 font-medium">Synthetic Society</span>
      </div>

      <div className="flex items-center gap-4 text-neutral-500">
        <span>
          Tick <span className="text-neutral-300">{tick}</span>/5
        </span>
        <span>
          Mean <span className="text-neutral-300">{stats.mean_position.toFixed(2)}</span>
        </span>
        <span>
          Polarization <span className="text-neutral-300">{stats.polarization_index.toFixed(2)}</span>
        </span>
        {gameMode !== "sandbox" && (
          <span>
            Progress{" "}
            <span className="text-neutral-300">{(winProgress * 100).toFixed(0)}%</span>
          </span>
        )}
      </div>

      <div className="ml-auto text-neutral-600">
        {gameMode}
      </div>
    </div>
  );
}
