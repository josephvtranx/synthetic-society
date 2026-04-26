"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useSimStore } from "@/lib/store";
import { populateSociety, createSim } from "@/lib/api";
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
  name: string,
) {
  const neckY = y + HEAD_R;
  const hipY = neckY + BODY_LEN;
  const footY = hipY + LEG_LEN;
  const legSwing = Math.sin(walkPhase) * 2;
  const armSwing = Math.sin(walkPhase + Math.PI) * 3;

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
}: {
  agents: AgentData[];
  edges: EdgeData[];
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
          agent.name,
        );
      }

      animRef.current = requestAnimationFrame(draw);
    },
    [agents, edges],
  );

  useEffect(() => {
    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [draw]);

  return (
    <div ref={containerRef} className="w-full h-full">
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
}

export default function SetupScreen() {
  const [topic, setTopic] = useState("");
  const [agents, setAgents] = useState<AgentData[]>([]);
  const [edges, setEdges] = useState<EdgeData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [starting, setStarting] = useState(false);
  const [societyReady, setSocietyReady] = useState(false);
  const startSession = useSimStore((s) => s.startSession);

  async function handleGenerate() {
    if (!topic.trim()) return;
    setGenerating(true);
    setError(null);
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

  async function handleStart() {
    setStarting(true);
    setError(null);
    try {
      const sim = await createSim(topic, "polarized", 25, true);
      startSession(sim.sim_id, sim.topic, sim.agents, sim.edges);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start simulation");
      setStarting(false);
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

      {/* Preview — after society generated */}
      {societyReady && (
        <div className="flex-1 flex flex-col overflow-hidden mx-6 mb-6" style={{ border: `2px solid ${TEXT_PRIMARY}` }}>
          <div className="flex-1 relative">
            <PreviewCanvas agents={agents} edges={edges} />
            {/* Topic banner */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-1.5" style={{ background: CARD, border: `1px solid ${TEXT_PRIMARY}` }}>
              <span className="text-xs uppercase tracking-wider" style={{ color: TEXT_PRIMARY, fontFamily: "'Courier New', monospace" }}>
                {topic}
              </span>
            </div>
            {/* Start button */}
            <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
              <button
                onClick={handleStart}
                disabled={starting}
                className="px-8 py-3 text-xs uppercase tracking-widest transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: TEXT_PRIMARY, color: CARD, fontFamily: "'Courier New', monospace", fontWeight: 700 }}
              >
                {starting ? "starting..." : "start simulation"}
              </button>
              <span className="text-xs uppercase tracking-wider px-3 py-1" style={{ color: TEXT_MUTED, fontFamily: "'Courier New', monospace", background: CARD }}>
                25 agents / {topic}
              </span>
            </div>
          </div>
          {error && (
            <div className="text-xs text-center px-3 py-2" style={{ borderTop: `1px solid ${TEXT_PRIMARY}`, color: TEXT_PRIMARY, fontFamily: "'Courier New', monospace" }}>
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
