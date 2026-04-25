"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useSimStore } from "@/lib/store";
import { populateSociety, runSimulation } from "@/lib/api";
import { positionToColor, BG_CANVAS, BG, TEXT_PRIMARY, TEXT_MUTED, CARD } from "@/lib/colors";
import { drawTownBackground } from "@/lib/draw-houses";
import type { AgentData, EdgeData } from "@/lib/types";

// Stick figure dimensions (match network-graph)
const HEAD_R = 7;
const BODY_LEN = 10;
const LEG_LEN = 8;
const LEG_SPREAD = 5;
const OUTLINE = 2;

function drawPreviewFigure(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  fill: string,
  blinking: boolean,
  walkPhase: number,
  isSelected: boolean,
  name: string,
) {
  const neckY = y + HEAD_R;
  const hipY = neckY + BODY_LEN;
  const footY = hipY + LEG_LEN;
  const legSwing = Math.sin(walkPhase) * 2;
  const armSwing = Math.sin(walkPhase + Math.PI) * 3;

  // Selection
  if (isSelected) {
    ctx.beginPath();
    ctx.arc(x, y, HEAD_R + 5, 0, Math.PI * 2);
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = OUTLINE;
  ctx.lineCap = "round";

  // Legs
  ctx.beginPath();
  ctx.moveTo(x, hipY);
  ctx.lineTo(x - LEG_SPREAD + legSwing, footY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, hipY);
  ctx.lineTo(x + LEG_SPREAD - legSwing, footY);
  ctx.stroke();

  // Body
  ctx.beginPath();
  ctx.moveTo(x, neckY);
  ctx.lineTo(x, hipY);
  ctx.stroke();

  // Arms
  const armY = neckY + 3;
  ctx.beginPath();
  ctx.moveTo(x, armY);
  ctx.lineTo(x - 6 + armSwing, armY + 7);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, armY);
  ctx.lineTo(x + 6 - armSwing, armY + 7);
  ctx.stroke();

  // Head
  ctx.beginPath();
  ctx.arc(x, y, HEAD_R, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = OUTLINE;
  ctx.stroke();

  // Eyes
  const eyeY = y - 1;
  const es = 3.5;
  if (blinking) {
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x - es - 1.5, eyeY); ctx.lineTo(x - es + 1.5, eyeY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + es - 1.5, eyeY); ctx.lineTo(x + es + 1.5, eyeY); ctx.stroke();
  } else {
    ctx.fillStyle = "#1a1a1a";
    ctx.beginPath(); ctx.arc(x - es, eyeY, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + es, eyeY, 1.5, 0, Math.PI * 2); ctx.fill();
  }

  // Smile
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 1.2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(x, y + 2.5, 3, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();
  ctx.lineCap = "butt";

  // Name
  ctx.font = "bold 9px 'Courier New', monospace";
  ctx.textAlign = "center";
  ctx.fillStyle = "#1a1a1a";
  ctx.fillText(name.split(" ")[0].toUpperCase(), x, footY + 12);
}

function PreviewCanvas({
  agents,
  edges,
  selectedId,
  onSelect,
}: {
  agents: AgentData[];
  edges: EdgeData[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);
  const phaseRef = useRef(0);
  const blinkTimers = useRef<Map<string, { timer: number; blinking: boolean }>>(new Map());

  const draw = useCallback(
    (time: number) => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const dpr = window.devicePixelRatio || 1;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
      }

      const ctx = canvas.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = BG_CANVAS;
      ctx.fillRect(0, 0, w, h);

      drawTownBackground(ctx, w, h);

      phaseRef.current = time / 1000;
      const pad = 60;
      const gw = w - pad * 2;
      const gh = h - pad * 2;

      // Edges
      for (const edge of edges) {
        const a = agents.find((a) => a.id === edge.source);
        const b = agents.find((a) => a.id === edge.target);
        if (!a || !b) continue;
        ctx.beginPath();
        ctx.moveTo(pad + a.x * gw, pad + a.y * gh);
        ctx.lineTo(pad + b.x * gw, pad + b.y * gh);
        ctx.strokeStyle = "rgba(0,0,0,0.06)";
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }

      // Agents as stick figures
      for (const agent of agents) {
        const x = pad + agent.x * gw;
        const y = pad + agent.y * gh;
        const isSelected = agent.id === selectedId;

        if (!blinkTimers.current.has(agent.id)) {
          blinkTimers.current.set(agent.id, { timer: 2 + Math.random() * 4, blinking: false });
        }
        const bt = blinkTimers.current.get(agent.id)!;
        bt.timer -= 0.016;
        if (bt.timer <= 0) {
          bt.blinking = !bt.blinking;
          bt.timer = bt.blinking ? 0.12 : 2 + Math.random() * 5;
        }

        drawPreviewFigure(
          ctx, x, y,
          positionToColor(agent.position),
          bt.blinking,
          phaseRef.current * 1.2 + agent.x * 10,
          isSelected,
          agent.name,
        );
      }

      animRef.current = requestAnimationFrame(draw);
    },
    [agents, selectedId, edges],
  );

  useEffect(() => {
    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [draw]);

  function handleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const pad = 60;
    const gw = container.clientWidth - pad * 2;
    const gh = container.clientHeight - pad * 2;

    for (const agent of agents) {
      const ax = pad + agent.x * gw;
      const ay = pad + agent.y * gh;
      if (Math.sqrt((mx - ax) ** 2 + (my - ay) ** 2) < 25) {
        onSelect(agent.id);
        return;
      }
    }
  }

  return (
    <div ref={containerRef} className="w-full h-full">
      <canvas ref={canvasRef} onClick={handleClick} className="w-full h-full cursor-pointer" />
    </div>
  );
}

export default function SetupScreen() {
  const [topic, setTopic] = useState("");
  const [prompt, setPrompt] = useState("");
  const [targetId, setTargetId] = useState<string | null>(null);
  const [agents, setAgents] = useState<AgentData[]>([]);
  const [edges, setEdges] = useState<EdgeData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [societyReady, setSocietyReady] = useState(false);
  const setTimeline = useSimStore((s) => s.setTimeline);
  const setLoading = useSimStore((s) => s.setLoading);
  const loading = useSimStore((s) => s.loading);

  const selectedAgent = targetId ? agents.find((a) => a.id === targetId) : null;

  async function handleGenerate() {
    if (!topic.trim()) return;
    setGenerating(true);
    setError(null);
    setTargetId(null);
    try {
      const data = await populateSociety("polarized", 25, topic);
      setAgents(data.agents);
      setEdges(data.edges);
      setSocietyReady(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate society");
    } finally {
      setGenerating(false);
    }
  }

  async function handleInject() {
    if (!prompt.trim() || !targetId) return;
    setLoading(true);
    setError(null);
    try {
      const targetIndex = agents.findIndex((a) => a.id === targetId);
      const timeline = await runSimulation({
        prompt,
        target_agent_id: targetId,
        target_index: targetIndex >= 0 ? targetIndex : 0,
        society_type: "polarized",
        n_agents: 25,
      });
      setTimeline(timeline, prompt);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Simulation failed");
      setLoading(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col" style={{ background: BG }}>
      {/* Title */}
      <div className="text-center pt-8 pb-4">
        <h1 className="text-3xl tracking-widest uppercase" style={{ color: TEXT_PRIMARY, fontFamily: "'Courier New', monospace", fontWeight: 700 }}>
          synthetic society
        </h1>
        <p className="text-xs mt-2 tracking-wide uppercase" style={{ color: TEXT_MUTED, fontFamily: "'Courier New', monospace" }}>
          drop an idea into a crowd. watch it spread. see what&apos;s real.
        </p>
      </div>

      {/* Topic input */}
      {!societyReady && (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-96 p-6" style={{ border: `2px solid ${TEXT_PRIMARY}` }}>
            <label className="text-xs block mb-2 uppercase tracking-wider" style={{ color: TEXT_MUTED, fontFamily: "'Courier New', monospace" }}>
              topic
            </label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
              placeholder="minimum wage, gun control, remote work..."
              className="w-full px-3 py-2 text-sm focus:outline-none mb-4"
              style={{ background: "transparent", border: `1px solid ${TEXT_PRIMARY}`, color: TEXT_PRIMARY, fontFamily: "'Courier New', monospace" }}
              autoFocus
            />
            <button
              onClick={handleGenerate}
              disabled={!topic.trim() || generating}
              className="w-full py-2.5 text-xs uppercase tracking-widest transition-all disabled:opacity-25 disabled:cursor-not-allowed"
              style={{ background: TEXT_PRIMARY, color: CARD, fontFamily: "'Courier New', monospace", fontWeight: 700 }}
            >
              {generating ? "generating..." : "generate society"}
            </button>
            {error && (
              <div className="text-xs text-center px-3 py-2 mt-3" style={{ border: "1px solid #1a1a1a", color: TEXT_PRIMARY, fontFamily: "'Courier New', monospace" }}>
                {error}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main — after society generated */}
      {societyReady && (
        <div className="flex-1 flex gap-0 overflow-hidden mx-6 mb-6" style={{ border: `2px solid ${TEXT_PRIMARY}` }}>
          {/* Canvas */}
          <div className="flex-1 relative">
            <PreviewCanvas agents={agents} edges={edges} selectedId={targetId} onSelect={setTargetId} />
            {!targetId && (
              <div className="absolute bottom-5 left-1/2 -translate-x-1/2 px-4 py-2" style={{ background: CARD, border: `1px solid ${TEXT_PRIMARY}` }}>
                <span className="text-xs uppercase tracking-wider" style={{ color: TEXT_PRIMARY, fontFamily: "'Courier New', monospace" }}>
                  click someone to target
                </span>
              </div>
            )}
            {/* Topic banner */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-1.5" style={{ background: CARD, border: `1px solid ${TEXT_PRIMARY}` }}>
              <span className="text-xs uppercase tracking-wider" style={{ color: TEXT_PRIMARY, fontFamily: "'Courier New', monospace" }}>
                {topic}
              </span>
            </div>
          </div>

          {/* Right panel */}
          <div className="w-80 p-5 flex flex-col gap-4" style={{ background: CARD, borderLeft: `2px solid ${TEXT_PRIMARY}` }}>
            {selectedAgent ? (
              <div className="p-3" style={{ border: `1px solid ${TEXT_PRIMARY}` }}>
                <div className="text-sm font-bold uppercase tracking-wide" style={{ color: TEXT_PRIMARY, fontFamily: "'Courier New', monospace" }}>
                  {selectedAgent.name}
                </div>
                {selectedAgent.stance && (
                  <div className="text-xs mt-2 leading-relaxed" style={{ color: TEXT_PRIMARY, fontFamily: "'Courier New', monospace" }}>
                    &ldquo;{selectedAgent.stance}&rdquo;
                  </div>
                )}
                <div className="mt-2 grid grid-cols-2 gap-1 text-xs" style={{ color: TEXT_MUTED, fontFamily: "'Courier New', monospace" }}>
                  <div>POS <span style={{ color: TEXT_PRIMARY }}>{selectedAgent.position.toFixed(2)}</span></div>
                  <div>OPN <span style={{ color: TEXT_PRIMARY }}>{((selectedAgent.openness ?? 0.5) * 100).toFixed(0)}%</span></div>
                  <div>CNF <span style={{ color: TEXT_PRIMARY }}>{((selectedAgent.conformity ?? 0.5) * 100).toFixed(0)}%</span></div>
                  <div>ID <span style={{ color: TEXT_PRIMARY }}>{(selectedAgent.identity_attachment * 100).toFixed(0)}%</span></div>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {selectedAgent.groups.map((g) => (
                    <span key={g} className="text-xs px-1.5 py-0.5 uppercase tracking-wider" style={{ border: `1px solid ${TEXT_PRIMARY}`, color: TEXT_PRIMARY, fontFamily: "'Courier New', monospace", fontSize: "9px" }}>
                      {g.replace("_", " ")}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-3 text-center" style={{ border: `1px solid ${TEXT_MUTED}` }}>
                <span className="text-xs uppercase tracking-wider" style={{ color: TEXT_MUTED, fontFamily: "'Courier New', monospace" }}>
                  select a target
                </span>
              </div>
            )}

            <div>
              <label className="text-xs block mb-1.5 uppercase tracking-wider" style={{ color: TEXT_MUTED, fontFamily: "'Courier New', monospace" }}>
                your argument
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="write something persuasive..."
                rows={5}
                className="w-full px-3 py-2 text-xs resize-none focus:outline-none"
                style={{ background: "transparent", border: `1px solid ${TEXT_PRIMARY}`, color: TEXT_PRIMARY, fontFamily: "'Courier New', monospace" }}
              />
            </div>

            <button
              onClick={handleInject}
              disabled={!prompt.trim() || !targetId || loading}
              className="w-full py-2.5 text-xs uppercase tracking-widest transition-all disabled:opacity-25 disabled:cursor-not-allowed"
              style={{ background: TEXT_PRIMARY, color: CARD, fontFamily: "'Courier New', monospace", fontWeight: 700 }}
            >
              {loading ? "simulating..." : "inject & watch"}
            </button>

            {error && (
              <div className="text-xs text-center px-3 py-2" style={{ border: "1px solid #1a1a1a", color: TEXT_PRIMARY, fontFamily: "'Courier New', monospace" }}>
                {error}
              </div>
            )}

            <div className="mt-auto text-center">
              <span className="text-xs uppercase tracking-wider" style={{ color: TEXT_MUTED, fontFamily: "'Courier New', monospace" }}>
                25 agents / {topic} / 1 idea
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
