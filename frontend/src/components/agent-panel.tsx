"use client";

import { useSelectedAgent, useSimStore, useCurrentSnapshot, useProbeResults, useAgentConversations, useCurrentAgents } from "@/lib/store";
import { CARD, TEXT_PRIMARY, TEXT_MUTED } from "@/lib/colors";

function positionLabel(p: number): string {
  if (p < -0.5) return "strongly against";
  if (p < -0.15) return "against";
  if (p < 0.15) return "neutral";
  if (p < 0.5) return "for";
  return "strongly for";
}

function TraitBar({ value, label }: { value: number; label: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs" style={{ color: TEXT_MUTED, fontFamily: "'Courier New', monospace" }}>
        <span className="uppercase tracking-wider">{label}</span>
        <span style={{ color: TEXT_PRIMARY, fontWeight: 700 }}>{(value * 100).toFixed(0)}%</span>
      </div>
      <div className="h-1.5 overflow-hidden" style={{ background: "rgba(0,0,0,0.06)" }}>
        <div className="h-full transition-all duration-700 ease-out" style={{ width: `${value * 100}%`, backgroundColor: "#1a1a1a" }} />
      </div>
    </div>
  );
}

export default function AgentPanel() {
  const agent = useSelectedAgent();
  const selectAgent = useSimStore((s) => s.selectAgent);
  const snapshot = useCurrentSnapshot();
  const probeResults = useProbeResults();
  const screen = useSimStore((s) => s.screen);
  const agentConversations = useAgentConversations(agent?.id ?? null);
  const allAgents = useCurrentAgents();

  const mono = { fontFamily: "'Courier New', monospace" };
  const nameById = (id: string) => allAgents.find((a) => a.id === id)?.name?.split(" ")[0] ?? id.slice(0, 6);

  if (!agent) {
    return (
      <div className="w-72 p-5 flex items-center justify-center" style={{ background: CARD, borderLeft: `2px solid ${TEXT_PRIMARY}` }}>
        <p className="text-xs uppercase tracking-wider" style={{ color: TEXT_MUTED, ...mono }}>click to inspect</p>
      </div>
    );
  }

  const shift = snapshot?.shifts.find((s) => s.agent_id === agent.id);
  const probe = probeResults.find((p) => p.agent_id === agent.id);

  return (
    <div className="w-72 p-5 overflow-y-auto" style={{ background: CARD, borderLeft: `2px solid ${TEXT_PRIMARY}` }}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold uppercase tracking-wide" style={{ color: TEXT_PRIMARY, ...mono }}>{agent.name}</h2>
        <button onClick={() => selectAgent(null)} className="text-xs uppercase" style={{ color: TEXT_MUTED, ...mono }}>x</button>
      </div>

      {agent.stance && (
        <div className="text-xs mb-4 leading-relaxed" style={{ color: TEXT_PRIMARY, ...mono }}>
          &ldquo;{agent.stance}&rdquo;
        </div>
      )}

      <div className="mb-4">
        <div className="text-xs" style={{ color: TEXT_MUTED, ...mono }}>
          POSITION <span style={{ color: TEXT_PRIMARY, fontWeight: 700 }}>{agent.position.toFixed(2)}</span>
          <span className="ml-1" style={{ color: TEXT_MUTED }}> {positionLabel(agent.position)}</span>
        </div>
        {shift && (
          <div className="text-xs mt-1 font-bold" style={{ color: TEXT_PRIMARY, ...mono }}>
            {shift.delta > 0 ? "+" : ""}{shift.delta.toFixed(3)} ({shift.source === "direct" ? "DIRECT" : "PRESSURE"})
          </div>
        )}
      </div>

      <div className="space-y-3 mb-4">
        <TraitBar value={agent.confidence} label="confidence" />
        {agent.openness != null && <TraitBar value={agent.openness} label="openness" />}
        {agent.conformity != null && <TraitBar value={agent.conformity} label="conformity" />}
        <TraitBar value={agent.identity_attachment} label="identity" />
      </div>

      <div className="mb-4">
        <div className="flex flex-wrap gap-1">
          {agent.groups.map((g) => (
            <span key={g} className="text-xs px-1.5 py-0.5 uppercase tracking-wider" style={{ border: `1px solid ${TEXT_PRIMARY}`, color: TEXT_PRIMARY, ...mono, fontSize: "9px" }}>
              {g.replace("_", " ")}
            </span>
          ))}
        </div>
      </div>

      {agentConversations.length > 0 && (
        <div className="pt-4 mb-4" style={{ borderTop: `1px solid ${TEXT_PRIMARY}` }}>
          <div className="text-xs mb-2 uppercase tracking-wider" style={{ color: TEXT_MUTED, ...mono }}>conversations</div>
          <div className="space-y-3 max-h-48 overflow-y-auto">
            {agentConversations.map((c, i) => (
              <div key={i} className="text-xs leading-relaxed" style={{ color: TEXT_PRIMARY, ...mono }}>
                <div style={{ color: TEXT_MUTED, fontSize: "9px" }}>TICK {c.tick}</div>
                <div><span style={{ fontWeight: 700 }}>{nameById(c.from_id)}:</span> {c.speaker_message}</div>
                <div className="mt-0.5"><span style={{ fontWeight: 700 }}>{nameById(c.to_id)}:</span> {c.listener_response}</div>
                {c.shift !== 0 && (
                  <div className="mt-0.5" style={{ color: TEXT_MUTED }}>
                    shift: {c.shift > 0 ? "+" : ""}{c.shift.toFixed(3)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {screen === "debrief" && probe && probe.shifted && (
        <div className="pt-4" style={{ borderTop: `1px solid ${TEXT_PRIMARY}` }}>
          <div className="text-xs mb-2 uppercase tracking-wider" style={{ color: TEXT_MUTED, ...mono }}>probe result</div>
          <div className="text-xs px-2.5 py-1.5 mb-3 font-bold uppercase tracking-wider" style={{
            border: `2px solid ${TEXT_PRIMARY}`,
            color: TEXT_PRIMARY,
            ...mono,
          }}>
            {probe.genuine ? "GENUINE SHIFT" : "SURFACE COMPLIANCE"}
          </div>
          <div className="text-xs space-y-2" style={{ color: TEXT_PRIMARY, ...mono }}>
            <div><span style={{ color: TEXT_MUTED }}>Q: </span>{probe.probe_question}</div>
            <div><span style={{ color: TEXT_MUTED }}>A: </span>{probe.probe_answer}</div>
          </div>
        </div>
      )}
    </div>
  );
}
