"use client";

import { useSimStore, useCurrentAgents } from "@/lib/store";
import { TEXT_PRIMARY, TEXT_MUTED } from "@/lib/colors";

const NUM_BINS = 20;
const mono = { fontFamily: "'Courier New', monospace" } as const;

function binAgents(agents: { position: number }[]): number[] {
  const bins = new Array(NUM_BINS).fill(0);
  for (const a of agents) {
    const idx = Math.min(NUM_BINS - 1, Math.max(0, Math.floor(((a.position + 1) / 2) * NUM_BINS)));
    bins[idx]++;
  }
  return bins;
}

export default function PopulationHistogram() {
  const ticks = useSimStore((s) => s.ticks);
  const agents = useCurrentAgents();

  if (agents.length === 0 || ticks.length === 0) return null;

  const initialAgents = ticks[0].agents;
  const currentBins = binAgents(agents);
  const initialBins = binAgents(initialAgents);
  const maxCount = Math.max(...currentBins, ...initialBins, 1);

  // Compute mean shift
  const initialMean = initialAgents.reduce((s, a) => s + a.position, 0) / initialAgents.length;
  const currentMean = agents.reduce((s, a) => s + a.position, 0) / agents.length;
  const meanShift = currentMean - initialMean;

  return (
    <div className="px-5 pb-2" style={mono}>
      <div className="flex items-center gap-4 mb-1">
        <span className="text-xs uppercase tracking-wider" style={{ color: TEXT_MUTED, fontSize: "9px" }}>
          population
        </span>
        <span className="text-xs" style={{ color: TEXT_MUTED, fontSize: "9px" }}>
          <span style={{ display: "inline-block", width: 8, height: 8, background: TEXT_PRIMARY, opacity: 0.7, marginRight: 3, verticalAlign: "middle" }} />
          now
        </span>
        <span className="text-xs" style={{ color: TEXT_MUTED, fontSize: "9px" }}>
          <span style={{ display: "inline-block", width: 8, height: 8, border: `1px solid ${TEXT_PRIMARY}`, opacity: 0.3, marginRight: 3, verticalAlign: "middle" }} />
          initial
        </span>
        {Math.abs(meanShift) > 0.005 && (
          <span className="text-xs font-bold" style={{ color: TEXT_PRIMARY, fontSize: "9px" }}>
            mean {meanShift > 0 ? "+" : ""}{meanShift.toFixed(3)}
          </span>
        )}
      </div>
      <div className="relative mx-auto" style={{ maxWidth: 500 }}>
        {/* Histogram bars */}
        <div className="flex items-end gap-px" style={{ height: 32 }}>
          {currentBins.map((count, i) => {
            const currentH = (count / maxCount) * 100;
            const initialH = (initialBins[i] / maxCount) * 100;
            return (
              <div key={i} className="flex-1 relative" style={{ height: "100%" }}>
                {/* Initial ghost bar */}
                <div
                  className="absolute bottom-0 w-full transition-all duration-500"
                  style={{
                    height: `${initialH}%`,
                    border: initialBins[i] > 0 ? `1px solid rgba(0,0,0,0.15)` : "none",
                    background: "transparent",
                  }}
                />
                {/* Current bar */}
                <div
                  className="absolute bottom-0 w-full transition-all duration-500"
                  style={{
                    height: `${currentH}%`,
                    background: TEXT_PRIMARY,
                    opacity: 0.7,
                  }}
                />
              </div>
            );
          })}
        </div>
        {/* Axis labels */}
        <div className="flex justify-between mt-0.5">
          <span style={{ color: TEXT_MUTED, fontSize: "8px" }}>against</span>
          <span style={{ color: TEXT_MUTED, fontSize: "8px" }}>neutral</span>
          <span style={{ color: TEXT_MUTED, fontSize: "8px" }}>for</span>
        </div>
      </div>
    </div>
  );
}
