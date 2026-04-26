"use client";

import { useState } from "react";
import { useSelectedAgent, useSimStore, useCurrentSnapshot, useProbeResults, useAgentConversations, useCurrentAgents, useInfluenceRemaining } from "@/lib/store";
import { injectArgument, introduceAgents, isolateAgent } from "@/lib/api";
import { SURF, RAISED, BORDER, BORDER_MD, TEXT_PRIMARY, TEXT_SECONDARY, TEXT_MUTED, GENUINE, COMPLIANT, ACTION, AGAINST, FONT_UI, FONT_MONO, positionToColor } from "@/lib/colors";
import { COST_INJECT, COST_INTRODUCE, COST_ISOLATE } from "@/lib/types";

function positionLabel(p: number): string {
  if (p < -0.5) return "strongly against";
  if (p < -0.15) return "against";
  if (p < 0.15) return "neutral";
  if (p < 0.5) return "for";
  return "strongly for";
}

// Tooltip component
function Tooltip({ content, children }: { content: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-flex items-center"
      onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      {show && (
        <span className="absolute bottom-[calc(100%+6px)] left-1/2 -translate-x-1/2 z-50 pointer-events-none whitespace-nowrap"
          style={{ background: RAISED, border: `1px solid ${BORDER_MD}`, color: TEXT_PRIMARY, padding: "6px 10px", borderRadius: 5, fontSize: 11, fontFamily: FONT_UI, lineHeight: 1.5, boxShadow: "0 6px 20px rgba(0,0,0,0.08)" }}>
          {content}
        </span>
      )}
    </span>
  );
}

// Position bar with gradient track and glowing marker
function PositionBar({ position }: { position: number }) {
  const pct = ((position + 1) / 2) * 100;
  const col = positionToColor(position);
  return (
    <div className="mb-4">
      <div className="flex justify-between items-baseline mb-1.5" style={{ fontFamily: FONT_UI, fontSize: 11 }}>
        <span style={{ color: TEXT_MUTED }}>Position</span>
        <span style={{ color: col, fontWeight: 700, fontFamily: FONT_MONO, fontSize: 14 }}>
          {position >= 0 ? "+" : ""}{position.toFixed(2)}{" "}
          <span style={{ fontSize: 10, fontWeight: 400, color: TEXT_SECONDARY }}>{positionLabel(position)}</span>
        </span>
      </div>
      <div className="relative h-2 rounded-full" style={{ background: "rgba(0,0,0,0.06)" }}>
        <div className="absolute inset-0 rounded-full" style={{ background: `linear-gradient(to right, ${AGAINST}, rgba(0,0,0,0.15) 50%, ${COMPLIANT})`, opacity: 0.35 }} />
        <div className="absolute rounded-full" style={{
          top: -3, width: 14, height: 14, borderRadius: "50%", background: col,
          border: `2px solid ${SURF}`, left: `calc(${pct}% - 7px)`,
          boxShadow: `0 0 10px ${col}60`, transition: "left 0.5s ease",
        }} />
      </div>
      <div className="flex justify-between mt-1" style={{ fontFamily: FONT_MONO, fontSize: 9, color: TEXT_MUTED }}>
        <span>-1</span><span>0</span><span>+1</span>
      </div>
    </div>
  );
}

// Trait row with tooltip and HIGH/LOW badge
const TRAIT_META: Record<string, { label: string; tip: string; color: string }> = {
  openness:    { label: "Openness",   tip: "How receptive to new arguments. High = easier to persuade.", color: GENUINE },
  conformity:  { label: "Conformity", tip: "How much they bend to social pressure. High = Asch effect is strong.", color: COMPLIANT },
  identity_attachment: { label: "Identity", tip: "How tied this belief is to their sense of self. High = very resistant.", color: AGAINST },
  confidence:  { label: "Confidence", tip: "How certain they feel in their current position.", color: ACTION },
};

function TraitRow({ traitKey, value }: { traitKey: string; value: number }) {
  const meta = TRAIT_META[traitKey];
  if (!meta) return null;
  const isHigh = value > 0.66;
  const isLow = value < 0.34;
  return (
    <div className="mb-3">
      <div className="flex justify-between items-center mb-1.5">
        <Tooltip content={meta.tip}>
          <span style={{ fontFamily: FONT_UI, fontSize: 11, color: TEXT_SECONDARY, cursor: "help", borderBottom: `1px dashed ${TEXT_MUTED}` }}>
            {meta.label}
          </span>
        </Tooltip>
        <div className="flex items-center gap-1.5">
          {(isHigh || isLow) && (
            <span style={{ fontSize: 9, fontFamily: FONT_MONO, color: isHigh ? meta.color : TEXT_MUTED, background: "rgba(0,0,0,0.05)", padding: "1px 5px", borderRadius: 3 }}>
              {isHigh ? "HIGH" : "LOW"}
            </span>
          )}
          <span style={{ fontFamily: FONT_MONO, fontSize: 12, fontWeight: 600, color: TEXT_PRIMARY }}>
            {(value * 100).toFixed(0)}
          </span>
        </div>
      </div>
      <div className="h-1 rounded-sm overflow-hidden" style={{ background: "rgba(0,0,0,0.06)" }}>
        <div className="h-full rounded-sm" style={{ width: `${value * 100}%`, background: meta.color, opacity: 0.8, transition: "width 0.5s ease" }} />
      </div>
    </div>
  );
}

// Badge component
function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontFamily: FONT_MONO, fontSize: 9, padding: "2px 7px", borderRadius: 3, border: `1px solid ${BORDER}`, color: TEXT_SECONDARY, letterSpacing: "0.05em", textTransform: "uppercase" as const }}>
      {children}
    </span>
  );
}

type Tab = "profile" | "history" | "actions";

export default function AgentPanel() {
  const agent = useSelectedAgent();
  const selectAgent = useSimStore((s) => s.selectAgent);
  const snapshot = useCurrentSnapshot();
  const probeResults = useProbeResults();
  const screen = useSimStore((s) => s.screen);
  const simId = useSimStore((s) => s.simId);
  const addInjectResult = useSimStore((s) => s.addInjectResult);
  const spendInject = useSimStore((s) => s.spendInject);
  const spendIntroduce = useSimStore((s) => s.spendIntroduce);
  const spendIsolate = useSimStore((s) => s.spendIsolate);
  const setEdges = useSimStore((s) => s.setEdges);
  const edges = useSimStore((s) => s.edges);
  const influenceRemaining = useInfluenceRemaining();
  const agentConversations = useAgentConversations(agent?.id ?? null);
  const allAgents = useCurrentAgents();
  const ticks = useSimStore((s) => s.ticks);

  const [tab, setTab] = useState<Tab>("profile");
  const [prompt, setPrompt] = useState("");
  const [injecting, setInjecting] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [introducePick, setIntroducePick] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const nameById = (id: string) => id === "player" ? "You" : allAgents.find((a) => a.id === id)?.name?.split(" ")[0] ?? id.slice(0, 6);

  const canAffordInject = influenceRemaining >= COST_INJECT;
  const canAffordIntroduce = influenceRemaining >= COST_INTRODUCE;
  const canAffordIsolate = influenceRemaining >= COST_ISOLATE;

  // Check if agent has any edges
  const agentEdgeCount = agent ? edges.filter((e) => e.source === agent.id || e.target === agent.id).length : 0;

  // Get agents NOT connected to current agent (for introduce picker)
  const connectedIds = agent ? new Set(
    edges.filter((e) => e.source === agent.id || e.target === agent.id)
      .map((e) => e.source === agent.id ? e.target : e.source)
  ) : new Set<string>();

  const introduceableAgents = agent ? allAgents.filter(
    (a) => a.id !== agent.id && !connectedIds.has(a.id)
  ) : [];

  async function handleInject() {
    if (!prompt.trim() || !agent || !simId || !canAffordInject) return;
    setInjecting(true);
    setLastResult(null);
    try {
      spendInject([agent.id]);
      const result = await injectArgument(simId, agent.id, prompt);
      addInjectResult(result, agent.id);
      setLastResult(`${result.actual_delta > 0 ? "+" : ""}${result.actual_delta.toFixed(3)} shift`);
      setPrompt("");
    } catch {
      setLastResult("inject failed");
    } finally {
      setInjecting(false);
    }
  }

  async function handleIntroduce(otherAgentId: string) {
    if (!agent || !simId || !canAffordIntroduce) return;
    setActionBusy(true);
    try {
      spendIntroduce(agent.id, otherAgentId);
      const result = await introduceAgents(simId, agent.id, otherAgentId);
      setEdges(result.edges);
      setIntroducePick(null);
      setLastResult(`Connected — trust ${result.trust.toFixed(2)}`);
    } catch {
      setLastResult("introduce failed");
    } finally {
      setActionBusy(false);
    }
  }

  async function handleIsolate() {
    if (!agent || !simId || !canAffordIsolate || agentEdgeCount === 0) return;
    setActionBusy(true);
    try {
      spendIsolate(agent.id);
      const result = await isolateAgent(simId, agent.id);
      setEdges(result.edges);
      setLastResult(`Isolated — ${result.edges_removed} edges cut`);
    } catch {
      setLastResult("isolate failed");
    } finally {
      setActionBusy(false);
    }
  }

  if (!agent) {
    return (
      <div className="w-72 flex flex-col items-center justify-center gap-2.5"
        style={{ background: SURF, borderLeft: `1px solid ${BORDER}` }}>
        <span style={{ fontSize: 28, opacity: 0.2 }}>&#9678;</span>
        <span style={{ fontFamily: FONT_UI, fontSize: 12, color: TEXT_MUTED, textAlign: "center", whiteSpace: "pre-line" }}>
          {"Click any agent\nto inspect them"}
        </span>
      </div>
    );
  }

  const shift = snapshot?.shifts.find((s) => s.agent_id === agent.id);
  const probe = probeResults.find((p) => p.agent_id === agent.id);
  const firstName = agent.name.split(" ")[0];

  return (
    <div className="w-72 flex flex-col overflow-hidden" style={{ background: SURF, borderLeft: `1px solid ${BORDER}` }}>
      {/* Header */}
      <div className="px-4 pt-3.5 pb-0">
        <div className="flex items-start justify-between mb-2">
          <div>
            <div style={{ fontFamily: FONT_UI, fontSize: 15, fontWeight: 700, color: TEXT_PRIMARY }}>{agent.name}</div>
            <div className="flex flex-wrap gap-1 mt-1">
              {agent.groups.map((g) => <Badge key={g}>{g.replace("_", " ")}</Badge>)}
            </div>
          </div>
          <button onClick={() => selectAgent(null)} style={{ color: TEXT_MUTED, fontFamily: FONT_UI, fontSize: 14 }}>x</button>
        </div>

        {/* Tabs */}
        <div className="flex mt-3" style={{ borderBottom: `1px solid ${BORDER}` }}>
          {(["profile", "history", "actions"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex-1 pb-2 text-center capitalize"
              style={{
                fontFamily: FONT_UI, fontSize: 11, fontWeight: 500,
                color: tab === t ? TEXT_PRIMARY : TEXT_MUTED,
                borderBottom: tab === t ? `2px solid ${ACTION}` : "2px solid transparent",
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {tab === "profile" && (
          <>
            <PositionBar position={agent.position} />

            {agent.stance && (
              <div className="mb-4 leading-relaxed" style={{
                fontFamily: FONT_UI, fontSize: 11, fontStyle: "italic", color: TEXT_SECONDARY,
                lineHeight: 1.7, padding: "10px 12px", background: "rgba(0,0,0,0.03)",
                borderRadius: 6, borderLeft: `2px solid ${BORDER_MD}`,
              }}>
                &ldquo;{agent.stance}&rdquo;
              </div>
            )}

            <div className="mb-2" style={{ fontFamily: FONT_UI, fontSize: 10, fontWeight: 600, color: TEXT_MUTED, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>
              Personality Traits
            </div>
            {agent.openness != null && <TraitRow traitKey="openness" value={agent.openness} />}
            {agent.conformity != null && <TraitRow traitKey="conformity" value={agent.conformity} />}
            <TraitRow traitKey="identity_attachment" value={agent.identity_attachment} />
            <TraitRow traitKey="confidence" value={agent.confidence} />

            {shift && (
              <div className="mt-3 py-2 px-3 rounded" style={{ background: "rgba(0,0,0,0.03)", fontFamily: FONT_MONO, fontSize: 10, fontWeight: 600, color: shift.delta > 0 ? GENUINE : AGAINST }}>
                {shift.delta > 0 ? "+" : ""}{shift.delta.toFixed(3)} shift ({shift.source})
              </div>
            )}

            {screen === "debrief" && probe && probe.shifted && (
              <div className="mt-4 pt-3" style={{ borderTop: `1px solid ${BORDER}` }}>
                <div className="mb-2" style={{ fontFamily: FONT_UI, fontSize: 10, fontWeight: 600, color: TEXT_MUTED, textTransform: "uppercase" as const }}>
                  Probe Result
                </div>
                <div className="px-2.5 py-1.5 mb-3 rounded" style={{
                  fontFamily: FONT_MONO, fontSize: 10, fontWeight: 600,
                  background: "rgba(0,0,0,0.03)", border: `1px solid ${BORDER}`,
                  color: probe.genuine ? GENUINE : COMPLIANT,
                }}>
                  {probe.genuine ? "GENUINE SHIFT" : "SURFACE COMPLIANCE"}
                </div>
                <div className="space-y-2" style={{ fontFamily: FONT_UI, fontSize: 11, color: TEXT_SECONDARY, lineHeight: 1.5 }}>
                  <div><span style={{ color: TEXT_MUTED }}>Q: </span>{probe.probe_question}</div>
                  <div><span style={{ color: TEXT_MUTED }}>A: </span>{probe.probe_answer}</div>
                </div>
              </div>
            )}
          </>
        )}

        {tab === "history" && (
          <>
            {agentConversations.length === 0 ? (
              <div style={{ fontFamily: FONT_UI, fontSize: 11, color: TEXT_MUTED, textAlign: "center", paddingTop: 20 }}>
                No conversations yet
              </div>
            ) : (
              <div className="space-y-3">
                {agentConversations.map((c, i) => {
                  const listenerDelta = c.delta_on_listener ?? 0;
                  const isPlayer = c.from_id === "player";
                  return (
                    <div key={i}>
                      <div className="mb-1.5" style={{ fontFamily: FONT_MONO, fontSize: 9, color: TEXT_MUTED }}>
                        TICK {c.tick}
                      </div>
                      <div className="px-2.5 py-2 rounded-md" style={{
                        background: "rgba(0,0,0,0.03)", borderRadius: 6,
                        borderLeft: `2px solid ${TEXT_MUTED}`,
                      }}>
                        <div style={{ fontFamily: FONT_UI, fontSize: 11, color: TEXT_SECONDARY, lineHeight: 1.5 }}>
                          <div><span style={{ fontWeight: 600 }}>{nameById(c.from_id)}:</span> {c.speaker_message}</div>
                          <div className="mt-1"><span style={{ fontWeight: 600 }}>{nameById(c.to_id)}:</span> {c.listener_response}</div>
                        </div>
                        {Math.abs(listenerDelta) > 0.001 && (
                          <div className="mt-1.5" style={{ fontFamily: FONT_MONO, fontSize: 10, fontWeight: 600, color: listenerDelta > 0 ? GENUINE : AGAINST }}>
                            {listenerDelta > 0 ? "+" : ""}{listenerDelta.toFixed(3)} shift
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {tab === "actions" && (
          <>
            {screen === "playback" && simId ? (
              <div className="space-y-4">
                {/* IP remaining */}
                <div className="flex items-center justify-between" style={{ fontFamily: FONT_MONO, fontSize: 10, color: TEXT_MUTED }}>
                  <span>IP remaining</span>
                  <span style={{ fontWeight: 700, color: influenceRemaining < 15 ? AGAINST : TEXT_PRIMARY, fontSize: 12 }}>{influenceRemaining}</span>
                </div>

                {/* Inject argument */}
                <div className="p-3 rounded-md" style={{ background: "rgba(0,0,0,0.02)", border: `1px solid ${BORDER}` }}>
                  <div className="flex items-center justify-between mb-2">
                    <span style={{ fontFamily: FONT_UI, fontSize: 11, fontWeight: 600, color: TEXT_PRIMARY }}>Inject Argument</span>
                    <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: canAffordInject ? GENUINE : AGAINST }}>{COST_INJECT} IP</span>
                  </div>
                  {canAffordInject ? (
                    <>
                      <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleInject(); } }}
                        placeholder="Write something persuasive..."
                        rows={3}
                        className="w-full resize-none focus:outline-none mb-2"
                        style={{ background: RAISED, border: `1px solid ${BORDER_MD}`, borderRadius: 5, padding: "8px 10px", fontFamily: FONT_UI, fontSize: 11, color: TEXT_PRIMARY, lineHeight: 1.5 }}
                      />
                      <button
                        onClick={handleInject}
                        disabled={!prompt.trim() || injecting}
                        className="w-full py-2 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                        style={{ background: ACTION, border: "none", borderRadius: 5, fontFamily: FONT_UI, fontSize: 11, fontWeight: 600, color: "white" }}
                      >
                        {injecting ? "Injecting..." : `Inject · ${COST_INJECT} IP`}
                      </button>
                    </>
                  ) : (
                    <div style={{ fontFamily: FONT_UI, fontSize: 10, color: TEXT_MUTED }}>Not enough IP</div>
                  )}
                </div>

                {/* Introduce */}
                <div className="p-3 rounded-md" style={{ background: "rgba(0,0,0,0.02)", border: `1px solid ${BORDER}` }}>
                  <div className="flex items-center justify-between mb-2">
                    <span style={{ fontFamily: FONT_UI, fontSize: 11, fontWeight: 600, color: TEXT_PRIMARY }}>Introduce</span>
                    <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: canAffordIntroduce ? GENUINE : AGAINST }}>{COST_INTRODUCE} IP</span>
                  </div>
                  <div className="mb-2" style={{ fontFamily: FONT_UI, fontSize: 10, color: TEXT_MUTED, lineHeight: 1.5 }}>
                    Connect {firstName} to another agent they don&apos;t know yet.
                  </div>
                  {canAffordIntroduce && introduceableAgents.length > 0 ? (
                    introducePick === null ? (
                      <button
                        onClick={() => setIntroducePick("picking")}
                        disabled={actionBusy}
                        className="w-full py-2 transition-all disabled:opacity-30"
                        style={{ background: "transparent", border: `1px solid ${BORDER_MD}`, borderRadius: 5, fontFamily: FONT_UI, fontSize: 11, fontWeight: 600, color: TEXT_SECONDARY }}
                      >
                        Pick agent to connect
                      </button>
                    ) : (
                      <div>
                        <div className="max-h-28 overflow-y-auto space-y-1 mb-2">
                          {introduceableAgents.map((a) => (
                            <button
                              key={a.id}
                              onClick={() => handleIntroduce(a.id)}
                              disabled={actionBusy}
                              className="w-full text-left px-2 py-1.5 rounded transition-all disabled:opacity-50"
                              style={{ fontFamily: FONT_UI, fontSize: 11, color: TEXT_PRIMARY, background: "rgba(0,0,0,0.03)" }}
                            >
                              <span style={{ fontWeight: 600 }}>{a.name.split(" ")[0]}</span>
                              <span style={{ color: TEXT_MUTED, marginLeft: 6 }}>
                                {a.groups[0]?.replace("_", " ")}
                              </span>
                              <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: positionToColor(a.position), marginLeft: 6 }}>
                                {a.position >= 0 ? "+" : ""}{a.position.toFixed(2)}
                              </span>
                            </button>
                          ))}
                        </div>
                        <button
                          onClick={() => setIntroducePick(null)}
                          style={{ fontFamily: FONT_UI, fontSize: 10, color: TEXT_MUTED, background: "none", border: "none" }}
                        >
                          Cancel
                        </button>
                      </div>
                    )
                  ) : (
                    <div style={{ fontFamily: FONT_UI, fontSize: 10, color: TEXT_MUTED }}>
                      {introduceableAgents.length === 0 ? "Already connected to everyone" : "Not enough IP"}
                    </div>
                  )}
                </div>

                {/* Isolate */}
                <div className="p-3 rounded-md" style={{ background: "rgba(0,0,0,0.02)", border: `1px solid ${BORDER}` }}>
                  <div className="flex items-center justify-between mb-2">
                    <span style={{ fontFamily: FONT_UI, fontSize: 11, fontWeight: 600, color: TEXT_PRIMARY }}>Isolate</span>
                    <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: canAffordIsolate ? AGAINST : TEXT_MUTED }}>{COST_ISOLATE} IP</span>
                  </div>
                  <div className="mb-2" style={{ fontFamily: FONT_UI, fontSize: 10, color: TEXT_MUTED, lineHeight: 1.5 }}>
                    Cut all {agentEdgeCount} connections. {firstName} won&apos;t talk to anyone or feel peer pressure.
                  </div>
                  {canAffordIsolate && agentEdgeCount > 0 ? (
                    <button
                      onClick={handleIsolate}
                      disabled={actionBusy}
                      className="w-full py-2 transition-all disabled:opacity-30"
                      style={{ background: AGAINST, border: "none", borderRadius: 5, fontFamily: FONT_UI, fontSize: 11, fontWeight: 600, color: "white" }}
                    >
                      {actionBusy ? "Isolating..." : `Isolate · ${COST_ISOLATE} IP`}
                    </button>
                  ) : (
                    <div style={{ fontFamily: FONT_UI, fontSize: 10, color: TEXT_MUTED }}>
                      {agentEdgeCount === 0 ? "Already isolated" : "Not enough IP"}
                    </div>
                  )}
                </div>

                {/* Result feedback */}
                {lastResult && (
                  <div className="text-center" style={{ fontFamily: FONT_MONO, fontSize: 11, color: TEXT_MUTED }}>
                    {lastResult}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ fontFamily: FONT_UI, fontSize: 11, color: TEXT_MUTED, textAlign: "center", paddingTop: 20 }}>
                Actions available during playback
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
