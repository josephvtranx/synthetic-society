"use client";

import { useState } from "react";
import { useStats, useTick, useSimStore } from "@/lib/store";
import { startSim, pauseSim, resumeSim, setSpeed } from "@/lib/ws";

export default function StatsBar() {
  const stats = useStats();
  const tick = useTick();
  const connected = useSimStore((s) => s.connected);
  const isRunning = useSimStore((s) => s.state.is_running);
  const hasConverged = useSimStore((s) => s.state.has_converged);
  const agentCount = useSimStore((s) => s.state.agents.length);

  const [showSetup, setShowSetup] = useState(false);
  const [topic, setTopic] = useState("minimum wage");
  const [nAgents, setNAgents] = useState(20);
  const [societyType, setSocietyType] = useState("random");

  function handleStart() {
    startSim(topic, nAgents, societyType);
    setShowSetup(false);
  }

  return (
    <div className="border-b border-neutral-800 bg-neutral-950">
      <div className="px-4 py-2 flex items-center gap-4 text-xs">
        {/* Connection indicator */}
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${connected ? "bg-green-500" : "bg-neutral-600"}`}
          />
          <span className="text-neutral-400 font-medium">Society Simulator</span>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          {agentCount === 0 ? (
            <button
              onClick={() => setShowSetup((s) => !s)}
              className="px-3 py-1 bg-neutral-200 text-neutral-900 font-medium rounded hover:bg-white transition-colors"
            >
              New Simulation
            </button>
          ) : (
            <>
              {isRunning ? (
                <button
                  onClick={pauseSim}
                  className="px-3 py-1 bg-neutral-700 text-neutral-200 rounded hover:bg-neutral-600 transition-colors"
                >
                  Pause
                </button>
              ) : (
                <button
                  onClick={resumeSim}
                  className="px-3 py-1 bg-neutral-200 text-neutral-900 font-medium rounded hover:bg-white transition-colors"
                >
                  {tick === 0 ? "Start" : "Resume"}
                </button>
              )}
              <button
                onClick={() => setShowSetup((s) => !s)}
                className="px-3 py-1 bg-neutral-800 text-neutral-400 rounded hover:bg-neutral-700 transition-colors"
              >
                Reset
              </button>
            </>
          )}
        </div>

        {/* Stats */}
        {agentCount > 0 && (
          <div className="flex items-center gap-4 text-neutral-500">
            <span>
              Tick <span className="text-neutral-300">{tick}</span>
            </span>
            <span>
              Agents <span className="text-neutral-300">{agentCount}</span>
            </span>
            <span>
              Mean <span className="text-neutral-300">{stats.mean_position.toFixed(2)}</span>
            </span>
            <span>
              Polarization{" "}
              <span className="text-neutral-300">
                {stats.polarization_index.toFixed(2)}
              </span>
            </span>
          </div>
        )}

        {/* Status badges */}
        <div className="ml-auto flex items-center gap-2">
          {hasConverged && (
            <span className="px-2 py-0.5 bg-green-900/50 text-green-400 rounded text-xs">
              Converged
            </span>
          )}
          {isRunning && (
            <span className="px-2 py-0.5 bg-blue-900/50 text-blue-400 rounded text-xs animate-pulse">
              Running
            </span>
          )}
          {/* Speed control */}
          {agentCount > 0 && (
            <select
              onChange={(e) => setSpeed(parseFloat(e.target.value))}
              defaultValue="3"
              className="bg-neutral-800 text-neutral-400 text-xs rounded px-2 py-1 border border-neutral-700"
            >
              <option value="1">1s/tick</option>
              <option value="2">2s/tick</option>
              <option value="3">3s/tick</option>
              <option value="5">5s/tick</option>
            </select>
          )}
        </div>
      </div>

      {/* Setup panel */}
      {showSetup && (
        <div className="px-4 py-3 border-t border-neutral-800 flex items-end gap-4">
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Topic</label>
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-neutral-100 w-48"
            />
          </div>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Agents</label>
            <input
              type="number"
              value={nAgents}
              onChange={(e) => setNAgents(parseInt(e.target.value) || 20)}
              min={5}
              max={50}
              className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-neutral-100 w-16"
            />
          </div>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Society</label>
            <select
              value={societyType}
              onChange={(e) => setSocietyType(e.target.value)}
              className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-neutral-100"
            >
              <option value="random">Random</option>
              <option value="polarized">Polarized</option>
              <option value="consensus">Consensus</option>
            </select>
          </div>
          <button
            onClick={handleStart}
            className="px-4 py-1.5 bg-neutral-200 text-neutral-900 text-sm font-medium rounded hover:bg-white transition-colors"
          >
            Launch
          </button>
        </div>
      )}
    </div>
  );
}
