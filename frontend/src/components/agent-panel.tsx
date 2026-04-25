"use client";

import { useSelectedAgent, useSimStore } from "@/lib/store";

function positionLabel(p: number): string {
  if (p < -0.5) return "Strongly Against";
  if (p < -0.15) return "Against";
  if (p < 0.15) return "Neutral";
  if (p < 0.5) return "For";
  return "Strongly For";
}

function Bar({ value, label }: { value: number; label: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-neutral-400">
        <span>{label}</span>
        <span>{(value * 100).toFixed(0)}%</span>
      </div>
      <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-neutral-400 rounded-full transition-all duration-500"
          style={{ width: `${value * 100}%` }}
        />
      </div>
    </div>
  );
}

export default function AgentPanel() {
  const agent = useSelectedAgent();
  const selectAgent = useSimStore((s) => s.selectAgent);

  if (!agent) {
    return (
      <div className="w-72 border-l border-neutral-800 bg-neutral-950 p-4 flex items-center justify-center">
        <p className="text-sm text-neutral-500">Click an agent to inspect</p>
      </div>
    );
  }

  return (
    <div className="w-72 border-l border-neutral-800 bg-neutral-950 p-4 overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-neutral-100">{agent.name}</h2>
        <button
          onClick={() => selectAgent(null)}
          className="text-xs text-neutral-500 hover:text-neutral-300"
        >
          close
        </button>
      </div>

      <div className="space-y-3 mb-6">
        <div className="text-xs text-neutral-400">
          Position: <span className="text-neutral-200">{agent.position.toFixed(2)} — {positionLabel(agent.position)}</span>
        </div>
        <Bar value={agent.confidence} label="Confidence" />
        <Bar value={agent.influence_score} label="Influence" />
        <Bar value={agent.identity_attachment} label="Identity Attachment" />
      </div>

      <div className="mb-4">
        <h3 className="text-xs font-medium text-neutral-400 mb-2">Groups</h3>
        <div className="flex flex-wrap gap-1">
          {agent.groups.map((g) => (
            <span key={g} className="text-xs px-2 py-0.5 bg-neutral-800 text-neutral-300 rounded">
              {g.replace("_", " ")}
            </span>
          ))}
        </div>
      </div>

      {agent.memory.length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-neutral-400 mb-2">Recent Memory</h3>
          <div className="space-y-2">
            {agent.memory.slice(-5).map((m, i) => (
              <div key={i} className="text-xs text-neutral-400 border-l border-neutral-700 pl-2">
                <span className="text-neutral-300">{m.from}</span> (tick {m.tick}): {m.message}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
