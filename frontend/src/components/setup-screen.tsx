"use client";

import { useState, useRef, useEffect } from "react";
import { useSimStore, useInfluenceRemaining } from "@/lib/store";
import { populateSociety, createSim, generateArgument } from "@/lib/api";
import { BG, SURF, RAISED, BORDER, BORDER_MD, TEXT_PRIMARY, TEXT_SECONDARY, TEXT_MUTED, ACTION, GENUINE, AGAINST, COMPLIANT, FONT_UI, FONT_MONO, BG_CANVAS, positionToColor } from "@/lib/colors";
import type { AgentData, EdgeData, Difficulty } from "@/lib/types";
import { INFLUENCE_BUDGET, COST_SCOUT, COST_INJECT } from "@/lib/types";
import { ChibiNode } from "@/components/chibi-node";

// Step indicator
function StepIndicator({ step }: { step: number }) {
  const steps = ["Topic", "Argument", "Target & Launch"];
  return (
    <div className="flex items-center justify-center" style={{ background: SURF, borderBottom: `1px solid ${BORDER}`, height: 52, padding: "0 32px" }}>
      <div className="flex items-center gap-0">
        {steps.map((label, i) => {
          const num = i + 1;
          const isComplete = step > num;
          const isCurrent = step === num;
          const isFuture = step < num;
          return (
            <div key={i} className="flex items-center">
              {i > 0 && (
                <div style={{ width: 30, height: 1, background: isComplete || isCurrent ? ACTION : BORDER }} />
              )}
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center rounded-full" style={{
                  width: 22, height: 22,
                  background: isComplete || isCurrent ? ACTION : RAISED,
                  border: isFuture ? `1px solid ${BORDER}` : "none",
                  color: isComplete || isCurrent ? "white" : TEXT_MUTED,
                  fontFamily: FONT_MONO, fontSize: 10, fontWeight: 600,
                }}>
                  {isComplete ? "✓" : num}
                </div>
                <span style={{
                  fontFamily: FONT_UI, fontSize: 12,
                  color: isCurrent ? TEXT_PRIMARY : TEXT_SECONDARY,
                  fontWeight: isCurrent ? 600 : 400,
                }}>
                  {label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// SVG preview for setup step 3
function PreviewSVG({ agents, edges, onClickAgent, selectedId, targetIds, scoutedIds }: {
  agents: AgentData[]; edges: EdgeData[]; onClickAgent?: (id: string) => void; selectedId?: string | null; targetIds: string[]; scoutedIds: string[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 600, h: 400 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setSize({ w: width, h: height });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const pad = 85;
  const gw = size.w - pad * 2;
  const gh = size.h - pad * 2;
  const ax = (a: AgentData) => pad + a.x * gw;
  const ay = (a: AgentData) => pad + a.y * gh;

  return (
    <div ref={containerRef} className="w-full h-full" style={{ background: BG_CANVAS }}>
      <svg width={size.w} height={size.h} style={{ display: "block" }}>
        <rect width={size.w} height={size.h} fill={BG_CANVAS} />
        {edges.map((e) => {
          const a = agents.find((x) => x.id === e.source);
          const b = agents.find((x) => x.id === e.target);
          if (!a || !b) return null;
          return <line key={`${e.source}-${e.target}`} x1={ax(a)} y1={ay(a)} x2={ax(b)} y2={ay(b)} stroke="rgba(0,0,0,0.1)" strokeWidth={0.8} />;
        })}
        {agents.map((a) => {
          const isTarget = targetIds.includes(a.id);
          const isScouted = scoutedIds.includes(a.id);
          return (
            <g key={a.id} onClick={(e) => { e.stopPropagation(); onClickAgent?.(a.id); }} style={{ cursor: "pointer" }}>
              {/* Target ring */}
              {isTarget && (
                <circle cx={ax(a)} cy={ay(a)} r={28} fill="none" stroke={ACTION} strokeWidth={2.5} strokeDasharray="6 3" opacity={0.8} />
              )}
              <ChibiNode x={ax(a)} y={ay(a)} agent={a} isSelected={a.id === selectedId} />
              {/* Scouted indicator */}
              {isScouted && !isTarget && (
                <circle cx={ax(a) + 14} cy={ay(a) - 18} r={4} fill={GENUINE} stroke="white" strokeWidth={1.5} />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// Trait row (simplified for setup)
function SetupTraitRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="mb-2">
      <div className="flex justify-between items-center mb-1">
        <span style={{ fontFamily: FONT_UI, fontSize: 11, color: TEXT_SECONDARY }}>{label}</span>
        <span style={{ fontFamily: FONT_MONO, fontSize: 11, fontWeight: 600, color: TEXT_PRIMARY }}>{(value * 100).toFixed(0)}</span>
      </div>
      <div className="h-1 rounded-sm overflow-hidden" style={{ background: "rgba(0,0,0,0.06)" }}>
        <div className="h-full rounded-sm" style={{ width: `${value * 100}%`, background: color, opacity: 0.8 }} />
      </div>
    </div>
  );
}

// Locked trait row — shows label but hides value
function LockedTraitRow({ label }: { label: string }) {
  return (
    <div className="mb-2">
      <div className="flex justify-between items-center mb-1">
        <span style={{ fontFamily: FONT_UI, fontSize: 11, color: TEXT_MUTED }}>{label}</span>
        <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: TEXT_MUTED }}>???</span>
      </div>
      <div className="h-1 rounded-sm overflow-hidden" style={{ background: "rgba(0,0,0,0.06)" }}>
        <div className="h-full rounded-sm" style={{ width: "100%", background: "rgba(0,0,0,0.04)" }} />
      </div>
    </div>
  );
}

const QUICK_TOPICS = ["Minimum wage", "Gun control", "Remote work", "AI regulation", "Universal healthcare"];

const DIFFICULTY_PRESETS: Record<Difficulty, { label: string; desc: string; societyType: string }> = {
  easy: {
    label: "Easy",
    desc: "Cult network: one leader, ultra-connected followers",
    societyType: "cult",
  },
  medium: {
    label: "Medium",
    desc: "Polarized baseline: clustered but bridgeable",
    societyType: "polarized",
  },
  hard: {
    label: "Hard",
    desc: "Echo chambers: two blocs with weak bridges",
    societyType: "echo_chambers",
  },
};

export default function SetupScreen() {
  const [step, setStep] = useState(1);
  const [topic, setTopic] = useState("");
  const [prompt, setPrompt] = useState("");
  const [agents, setAgents] = useState<AgentData[]>([]);
  const [edges, setEdges] = useState<EdgeData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [generatingArg, setGeneratingArg] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [starting, setStarting] = useState(false);
  const [selectedPreviewId, setSelectedPreviewId] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const startSession = useSimStore((s) => s.startSession);
  const setPromptStore = useSimStore((s) => s.setPrompt);
  const setDifficultyStore = useSimStore((s) => s.setDifficulty);
  const setTargetAgentIds = useSimStore((s) => s.setTargetAgentIds);
  const spendInject = useSimStore((s) => s.spendInject);
  const influenceRemaining = useInfluenceRemaining();
  const influenceSpent = useSimStore((s) => s.influenceSpent);
  const scoutAgent = useSimStore((s) => s.scoutAgent);
  const scoutedAgentIds = useSimStore((s) => s.scoutedAgentIds);
  const [targetIds, setTargetIds] = useState<string[]>([]);

  const selectedAgent = agents.find((a) => a.id === selectedPreviewId);
  const isScouted = selectedPreviewId ? scoutedAgentIds.includes(selectedPreviewId) : false;
  const isTarget = selectedPreviewId ? targetIds.includes(selectedPreviewId) : false;
  const injectCost = targetIds.length * COST_INJECT;
  const canAffordInject = influenceRemaining >= COST_INJECT;
  const canAffordScout = influenceRemaining >= COST_SCOUT;

  function handleToggleTarget(id: string) {
    if (targetIds.includes(id)) {
      setTargetIds(targetIds.filter((t) => t !== id));
    } else if (influenceRemaining >= COST_INJECT) {
      setTargetIds([...targetIds, id]);
    }
  }

  function handleScout(id: string) {
    if (scoutedAgentIds.includes(id)) return;
    scoutAgent(id);
  }

  async function handleGenerateArgument() {
    if (!topic.trim()) return;
    setGeneratingArg(true);
    setError(null);
    try {
      const argument = await generateArgument(topic);
      setPrompt(argument);
      setStep(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate argument");
    } finally {
      setGeneratingArg(false);
    }
  }

  async function handleBuildSociety() {
    if (!prompt.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      const preset = DIFFICULTY_PRESETS[difficulty];
      const data = await populateSociety(preset.societyType, 25, topic, difficulty);
      setAgents(data.agents);
      setEdges(data.edges);
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate society");
    } finally {
      setGenerating(false);
    }
  }

  async function handleStart() {
    if (targetIds.length === 0) {
      setError("Select at least one target agent");
      return;
    }
    if (injectCost > influenceRemaining) {
      setError("Not enough IP for selected targets");
      return;
    }
    setStarting(true);
    setError(null);
    try {
      const preset = DIFFICULTY_PRESETS[difficulty];
      // Deduct inject cost
      spendInject(targetIds);
      setTargetAgentIds(targetIds);
      setPromptStore(prompt);
      setDifficultyStore(difficulty);
      const sim = await createSim(topic, preset.societyType, 25, true, difficulty);
      startSession(sim.sim_id, sim.topic, sim.agents, sim.edges);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start simulation");
      setStarting(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col" style={{ background: BG }}>
      <StepIndicator step={step} />

      {/* Step 1: Topic */}
      {step === 1 && (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-[520px]">
            <h1 style={{ fontFamily: FONT_UI, fontSize: 22, fontWeight: 700, color: TEXT_PRIMARY, textAlign: "center", marginBottom: 8 }}>
              What debate are we running?
            </h1>
            <p style={{ fontFamily: FONT_UI, fontSize: 13, color: TEXT_SECONDARY, textAlign: "center", lineHeight: 1.6, marginBottom: 28 }}>
              Pick a topic, and we&apos;ll generate a structured argument you can inject into a simulated society of 25 AI agents.
            </p>

            <label style={{ fontFamily: FONT_UI, fontSize: 11, fontWeight: 600, color: TEXT_SECONDARY, textTransform: "uppercase" as const, letterSpacing: "0.08em", display: "block", marginBottom: 10 }}>
              Topic
            </label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleGenerateArgument()}
              placeholder="e.g. minimum wage, gun control, remote work..."
              autoFocus
              className="w-full focus:outline-none mb-4"
              style={{ background: RAISED, border: `1px solid ${BORDER_MD}`, borderRadius: 8, padding: "12px 14px", fontFamily: FONT_UI, fontSize: 14, color: TEXT_PRIMARY }}
            />

            {/* Quick-pick pills */}
            <div className="flex flex-wrap gap-2 mb-6">
              {QUICK_TOPICS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTopic(t)}
                  style={{
                    border: `1px solid ${BORDER}`, borderRadius: 20, padding: "6px 12px",
                    fontFamily: FONT_UI, fontSize: 11,
                    background: topic === t ? ACTION : "transparent",
                    color: topic === t ? "white" : TEXT_SECONDARY,
                  }}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Difficulty selector */}
            <div className="mb-6">
              <label style={{ fontFamily: FONT_UI, fontSize: 11, fontWeight: 600, color: TEXT_SECONDARY, textTransform: "uppercase" as const, letterSpacing: "0.08em", display: "block", marginBottom: 8 }}>
                Difficulty
              </label>
              <div className="flex gap-2">
                {(Object.entries(DIFFICULTY_PRESETS) as Array<[Difficulty, { label: string; desc: string }]>)
                  .map(([value, d]) => (
                  <button
                    key={value}
                    onClick={() => setDifficulty(value)}
                    className="flex-1 py-2.5 transition-all"
                    style={{
                      border: difficulty === value ? `2px solid ${ACTION}` : `1px solid ${BORDER}`,
                      borderRadius: 8,
                      background: difficulty === value ? "rgba(0,0,0,0.03)" : "transparent",
                      fontFamily: FONT_UI, fontSize: 12,
                    }}
                  >
                    <div style={{ fontWeight: 600, color: difficulty === value ? TEXT_PRIMARY : TEXT_SECONDARY }}>
                      {d.label}
                    </div>
                    <div style={{ fontSize: 10, color: TEXT_MUTED, marginTop: 2 }}>
                      {d.desc}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleGenerateArgument}
              disabled={!topic.trim() || generatingArg}
              className="w-full transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ background: ACTION, borderRadius: 8, padding: "14px 0", fontFamily: FONT_UI, fontSize: 13, fontWeight: 600, color: "white", border: "none" }}
            >
              {generatingArg ? "Generating argument..." : "Generate argument →"}
            </button>

            {error && (
              <div className="mt-3 text-center" style={{ fontFamily: FONT_UI, fontSize: 12, color: AGAINST }}>{error}</div>
            )}
          </div>
        </div>
      )}

      {/* Step 2: Argument */}
      {step === 2 && (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-[520px]">
            <div className="flex items-center gap-3 mb-2">
              <h1 style={{ fontFamily: FONT_UI, fontSize: 22, fontWeight: 700, color: TEXT_PRIMARY }}>Your argument</h1>
              <span style={{ fontFamily: FONT_MONO, fontSize: 10, background: "rgba(0,0,0,0.05)", padding: "3px 8px", borderRadius: 4, color: TEXT_SECONDARY }}>
                AI-generated · edit freely
              </span>
            </div>
            <p style={{ fontFamily: FONT_UI, fontSize: 13, color: TEXT_SECONDARY, lineHeight: 1.6, marginBottom: 22 }}>
              This is what you&apos;ll inject into the society. Edit it to make it more persuasive, add evidence, or change the angle.
            </p>

            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={8}
              className="w-full resize-none focus:outline-none mb-4"
              style={{ background: RAISED, border: `1px solid ${BORDER_MD}`, borderRadius: 8, padding: "14px 16px", fontFamily: FONT_UI, fontSize: 12, color: TEXT_SECONDARY, lineHeight: 1.75 }}
            />

            <div className="flex gap-2.5">
              <button
                onClick={() => setStep(1)}
                className="flex-1 transition-all"
                style={{ border: `1px solid ${BORDER}`, borderRadius: 8, padding: "12px 0", fontFamily: FONT_UI, fontSize: 13, color: TEXT_SECONDARY, background: "transparent" }}
              >
                ← Back
              </button>
              <button
                onClick={handleBuildSociety}
                disabled={!prompt.trim() || generating}
                className="flex-[2] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                style={{ background: ACTION, borderRadius: 8, padding: "12px 0", fontFamily: FONT_UI, fontSize: 13, fontWeight: 600, color: "white", border: "none" }}
              >
                {generating ? "Building society..." : "Build the society →"}
              </button>
            </div>

            {error && (
              <div className="mt-3 text-center" style={{ fontFamily: FONT_UI, fontSize: 12, color: AGAINST }}>{error}</div>
            )}
          </div>
        </div>
      )}

      {/* Step 3: Target & Launch */}
      {step === 3 && (
        <div className="flex-1 flex gap-5 overflow-hidden p-5">
          {/* Left: society preview */}
          <div className="flex-1 flex flex-col overflow-hidden" style={{ background: SURF, borderRadius: 10, border: `1px solid ${BORDER}` }}>
            <div className="px-4 py-2.5 flex items-center justify-between" style={{ borderBottom: `1px solid ${BORDER}` }}>
              <span style={{ fontFamily: FONT_UI, fontSize: 11, fontWeight: 600, color: TEXT_SECONDARY, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>
                Society Preview · {agents.length} agents
              </span>
              <span style={{ fontFamily: FONT_UI, fontSize: 10, color: TEXT_MUTED }}>
                Click to select · Scout to reveal traits
              </span>
            </div>
            <div className="flex-1">
              <PreviewSVG
                agents={agents}
                edges={edges}
                onClickAgent={(id) => setSelectedPreviewId(id)}
                selectedId={selectedPreviewId}
                targetIds={targetIds}
                scoutedIds={scoutedAgentIds}
              />
            </div>
          </div>

          {/* Right: controls */}
          <div className="w-[280px] flex flex-col gap-3.5">
            {/* Selected agent card */}
            {selectedAgent ? (
              <div className="p-4" style={{ background: SURF, borderRadius: 8, border: `1px solid ${BORDER}` }}>
                <div className="flex items-center justify-between mb-2">
                  <span style={{ fontFamily: FONT_UI, fontSize: 13, fontWeight: 700, color: TEXT_PRIMARY }}>
                    {selectedAgent.name}
                  </span>
                  <div className="flex gap-1">
                    {selectedAgent.groups.map((g) => (
                      <span key={g} style={{ fontFamily: FONT_MONO, fontSize: 8, padding: "2px 5px", borderRadius: 3, border: `1px solid ${BORDER}`, color: TEXT_MUTED, textTransform: "uppercase" as const }}>
                        {g.replace("_", " ")}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Position — always visible */}
                <div className="mb-3">
                  <div className="flex justify-between mb-1">
                    <span style={{ fontFamily: FONT_UI, fontSize: 11, color: TEXT_MUTED }}>Position</span>
                    <span style={{ fontFamily: FONT_MONO, fontSize: 12, fontWeight: 600, color: positionToColor(selectedAgent.position) }}>
                      {selectedAgent.position >= 0 ? "+" : ""}{selectedAgent.position.toFixed(2)}
                    </span>
                  </div>
                  <div className="relative h-1.5 rounded-full" style={{ background: "rgba(0,0,0,0.06)" }}>
                    <div className="absolute rounded-full" style={{
                      top: -2, width: 10, height: 10, borderRadius: "50%",
                      background: positionToColor(selectedAgent.position),
                      left: `calc(${((selectedAgent.position + 1) / 2) * 100}% - 5px)`,
                      border: `2px solid ${SURF}`,
                    }} />
                  </div>
                </div>

                {/* Traits — gated behind scout */}
                {isScouted ? (
                  <>
                    <div className="mb-1.5" style={{ fontFamily: FONT_UI, fontSize: 9, fontWeight: 600, color: GENUINE, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>
                      Scouted
                    </div>
                    {selectedAgent.openness != null && <SetupTraitRow label="Openness" value={selectedAgent.openness} color={GENUINE} />}
                    {selectedAgent.conformity != null && <SetupTraitRow label="Conformity" value={selectedAgent.conformity} color={COMPLIANT} />}
                    <SetupTraitRow label="Identity" value={selectedAgent.identity_attachment} color={AGAINST} />
                    <SetupTraitRow label="Confidence" value={selectedAgent.confidence} color={ACTION} />

                    {selectedAgent.stance && (
                      <div className="mt-2 italic" style={{ fontFamily: FONT_UI, fontSize: 10, color: TEXT_MUTED, lineHeight: 1.6, padding: "6px 8px", background: "rgba(0,0,0,0.03)", borderRadius: 6 }}>
                        &ldquo;{selectedAgent.stance}&rdquo;
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <LockedTraitRow label="Openness" />
                    <LockedTraitRow label="Conformity" />
                    <LockedTraitRow label="Identity" />
                    <LockedTraitRow label="Confidence" />

                    <button
                      onClick={() => handleScout(selectedAgent.id)}
                      disabled={!canAffordScout}
                      className="w-full mt-2 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                      style={{ background: GENUINE, border: "none", borderRadius: 6, padding: "8px 0", fontFamily: FONT_UI, fontSize: 11, fontWeight: 600, color: "white" }}
                    >
                      Scout · {COST_SCOUT} IP
                    </button>
                  </>
                )}

                {/* Target toggle */}
                <button
                  onClick={() => handleToggleTarget(selectedAgent.id)}
                  disabled={!isTarget && !canAffordInject}
                  className="w-full mt-3 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{
                    background: isTarget ? ACTION : "transparent",
                    border: isTarget ? "none" : `1px solid ${BORDER_MD}`,
                    borderRadius: 6, padding: "8px 0",
                    fontFamily: FONT_UI, fontSize: 11, fontWeight: 600,
                    color: isTarget ? "white" : TEXT_SECONDARY,
                  }}
                >
                  {isTarget ? "Remove target" : `Set as target · ${COST_INJECT} IP`}
                </button>
              </div>
            ) : (
              <div className="p-4 flex items-center justify-center" style={{ background: SURF, borderRadius: 8, border: `1px solid ${BORDER}`, minHeight: 120 }}>
                <span style={{ fontFamily: FONT_UI, fontSize: 11, color: TEXT_MUTED }}>Click an agent to inspect</span>
              </div>
            )}

            {/* IP budget card */}
            <div className="p-4" style={{ background: SURF, borderRadius: 8, border: `1px solid ${BORDER}` }}>
              <div className="flex items-center justify-between mb-2">
                <span style={{ fontFamily: FONT_UI, fontSize: 11, color: TEXT_SECONDARY }}>Influence Points</span>
                <span style={{ fontFamily: FONT_MONO, fontSize: 13, fontWeight: 700, color: influenceRemaining < 30 ? AGAINST : TEXT_PRIMARY }}>
                  {influenceRemaining} / {INFLUENCE_BUDGET}
                </span>
              </div>
              <div className="h-1.5 rounded-full mb-3" style={{ background: "rgba(0,0,0,0.06)" }}>
                <div className="h-full rounded-full transition-all duration-300" style={{ width: `${(influenceRemaining / INFLUENCE_BUDGET) * 100}%`, background: influenceRemaining < 30 ? AGAINST : ACTION }} />
              </div>

              {/* Spending breakdown */}
              <div className="space-y-1" style={{ fontFamily: FONT_UI, fontSize: 10, color: TEXT_MUTED }}>
                {scoutedAgentIds.length > 0 && (
                  <div className="flex justify-between">
                    <span>{scoutedAgentIds.length} scouted</span>
                    <span style={{ fontFamily: FONT_MONO, color: TEXT_SECONDARY }}>-{scoutedAgentIds.length * COST_SCOUT} IP</span>
                  </div>
                )}
                {targetIds.length > 0 && (
                  <div className="flex justify-between">
                    <span>{targetIds.length} target{targetIds.length > 1 ? "s" : ""}</span>
                    <span style={{ fontFamily: FONT_MONO, color: TEXT_SECONDARY }}>-{injectCost} IP</span>
                  </div>
                )}
              </div>

              <div className="mt-3 pt-2.5 space-y-1" style={{ borderTop: `1px solid ${BORDER}`, fontFamily: FONT_UI, fontSize: 11, color: TEXT_MUTED, lineHeight: 1.7 }}>
                <div><span style={{ color: GENUINE, fontWeight: 600 }}>Scout</span> ({COST_SCOUT} IP) — reveal personality traits</div>
                <div><span style={{ color: ACTION, fontWeight: 600 }}>Target</span> ({COST_INJECT} IP) — inject your argument at start</div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 mt-auto">
              <button
                onClick={() => setStep(2)}
                className="flex-1 transition-all"
                style={{ border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 0", fontFamily: FONT_UI, fontSize: 13, color: TEXT_SECONDARY, background: "transparent" }}
              >
                ← Back
              </button>
              <button
                onClick={handleStart}
                disabled={starting || targetIds.length === 0}
                className="flex-[2] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: ACTION, borderRadius: 8, padding: "10px 0", fontFamily: FONT_UI, fontSize: 13, fontWeight: 700, color: "white", border: "none" }}
              >
                {starting ? "Starting..." : `Start · ${injectCost} IP →`}
              </button>
            </div>

            {error && (
              <div className="text-center" style={{ fontFamily: FONT_UI, fontSize: 12, color: AGAINST }}>{error}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
