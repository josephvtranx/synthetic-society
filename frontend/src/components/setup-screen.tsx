"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useSimStore } from "@/lib/store";
import { populateSociety, runSimulation } from "@/lib/api";
import { positionToColor, BG_CANVAS, BG, TEXT_PRIMARY, TEXT_SECONDARY, TEXT_MUTED, CARD } from "@/lib/colors";
import { drawTownBackground } from "@/lib/draw-houses";
import type { AgentData, EdgeData } from "@/lib/types";

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
  const bobRef = useRef(0);
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

      bobRef.current = time / 1000;
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
        ctx.strokeStyle = "rgba(0,0,0,0.04)";
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }

      // Agents
      for (const agent of agents) {
        const x = pad + agent.x * gw;
        const bobOffset = Math.sin(bobRef.current * 1.6 + agent.x * 10) * 1.8;
        const y = pad + agent.y * gh + bobOffset;
        const isSelected = agent.id === selectedId;
        const radius = isSelected ? 15 : 11;

        if (!blinkTimers.current.has(agent.id)) {
          blinkTimers.current.set(agent.id, { timer: 2 + Math.random() * 4, blinking: false });
        }
        const bt = blinkTimers.current.get(agent.id)!;
        bt.timer -= 0.016;
        if (bt.timer <= 0) {
          bt.blinking = !bt.blinking;
          bt.timer = bt.blinking ? 0.12 : 2 + Math.random() * 5;
        }

        // Shadow
        ctx.beginPath();
        ctx.ellipse(pad + agent.x * gw, pad + agent.y * gh + radius + 4, radius * 0.6, 2.5, 0, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(0,0,0,0.06)";
        ctx.fill();

        // Body
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = positionToColor(agent.position);
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.12)";
        ctx.lineWidth = 0.8;
        ctx.stroke();

        // Highlight
        ctx.beginPath();
        ctx.arc(x - radius * 0.25, y - radius * 0.3, radius * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.25)";
        ctx.fill();

        // Selection
        if (isSelected) {
          ctx.beginPath();
          ctx.arc(x, y, radius + 3, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(60,60,80,0.5)";
          ctx.lineWidth = 1.5;
          ctx.setLineDash([3, 3]);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Eyes
        const eyeY = y - 1.5;
        const es = 3.5;
        if (bt.blinking) {
          ctx.strokeStyle = "#3a3a40";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x - es - 1.5, eyeY);
          ctx.lineTo(x - es + 1.5, eyeY);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(x + es - 1.5, eyeY);
          ctx.lineTo(x + es + 1.5, eyeY);
          ctx.stroke();
        } else {
          ctx.fillStyle = "#3a3a40";
          ctx.beginPath();
          ctx.arc(x - es, eyeY, 1.6, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(x + es, eyeY, 1.6, 0, Math.PI * 2);
          ctx.fill();
        }

        // Smile
        ctx.beginPath();
        ctx.arc(x, y + 2.5, 3, Math.PI * 0.15, Math.PI * 0.85);
        ctx.strokeStyle = "#3a3a40";
        ctx.lineWidth = 1;
        ctx.lineCap = "round";
        ctx.stroke();
        ctx.lineCap = "butt";

        // Name
        ctx.font = "10px 'Inter', system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(40,40,50,0.45)";
        ctx.fillText(agent.name.split(" ")[0], pad + agent.x * gw, pad + agent.y * gh + radius + 14);
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
      if (Math.sqrt((mx - ax) ** 2 + (my - ay) ** 2) < 18) {
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
  const [prompt, setPrompt] = useState("");
  const [targetId, setTargetId] = useState<string | null>(null);
  const [agents, setAgents] = useState<AgentData[]>([]);
  const [edges, setEdges] = useState<EdgeData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const setTimeline = useSimStore((s) => s.setTimeline);
  const setLoading = useSimStore((s) => s.setLoading);
  const loading = useSimStore((s) => s.loading);

  // Fetch real population on mount
  useEffect(() => {
    populateSociety("polarized", 25)
      .then((data) => {
        setAgents(data.agents);
        setEdges(data.edges);
      })
      .catch(() => {
        // Fallback: if backend is down, import mock data
        import("@/lib/mock-data").then(({ MOCK_TIMELINE }) => {
          setAgents(MOCK_TIMELINE.ticks[0].agents);
          setEdges(MOCK_TIMELINE.edges);
        });
      });
  }, []);

  const selectedAgent = targetId ? agents.find((a) => a.id === targetId) : null;

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
      setTimeline(timeline);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Simulation failed");
      setLoading(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col" style={{ background: BG }}>
      {/* Title */}
      <div className="text-center pt-8 pb-4">
        <h1 className="text-3xl font-light tracking-wide" style={{ color: TEXT_PRIMARY }}>
          synthetic society
        </h1>
        <p className="text-sm mt-2" style={{ color: TEXT_MUTED }}>
          drop an idea into a small town. see what spreads. see what&apos;s real.
        </p>
      </div>

      {/* Main */}
      <div className="flex-1 flex gap-0 overflow-hidden mx-6 mb-6 rounded-2xl" style={{ border: "1px solid rgba(0,0,0,0.06)" }}>
        {/* Canvas */}
        <div className="flex-1 relative">
          <PreviewCanvas agents={agents} edges={edges} selectedId={targetId} onSelect={setTargetId} />
          {!targetId && (
            <div className="absolute bottom-5 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full shadow-sm" style={{ background: CARD, border: "1px solid rgba(0,0,0,0.06)" }}>
              <span className="text-xs" style={{ color: TEXT_MUTED }}>click someone to target</span>
            </div>
          )}
        </div>

        {/* Right panel */}
        <div className="w-80 p-6 flex flex-col gap-5" style={{ background: CARD, borderLeft: "1px solid rgba(0,0,0,0.06)" }}>
          {selectedAgent ? (
            <div className="rounded-xl p-4" style={{ background: "rgba(0,0,0,0.02)" }}>
              <div className="text-sm font-medium" style={{ color: TEXT_PRIMARY }}>{selectedAgent.name}</div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs" style={{ color: TEXT_MUTED }}>
                <div>Position <span style={{ color: TEXT_SECONDARY }}>{selectedAgent.position.toFixed(2)}</span></div>
                <div>Openness <span style={{ color: TEXT_SECONDARY }}>{((selectedAgent.openness ?? 0.5) * 100).toFixed(0)}%</span></div>
                <div>Conformity <span style={{ color: TEXT_SECONDARY }}>{((selectedAgent.conformity ?? 0.5) * 100).toFixed(0)}%</span></div>
                <div>Identity <span style={{ color: TEXT_SECONDARY }}>{(selectedAgent.identity_attachment * 100).toFixed(0)}%</span></div>
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {selectedAgent.groups.map((g) => (
                  <span key={g} className="text-xs px-1.5 py-0.5 rounded" style={{ background: "rgba(0,0,0,0.04)", color: TEXT_MUTED }}>
                    {g.replace("_", " ")}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-xl p-4 text-center" style={{ background: "rgba(0,0,0,0.02)" }}>
              <span className="text-xs" style={{ color: TEXT_MUTED }}>no target selected</span>
            </div>
          )}

          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <label className="text-xs" style={{ color: TEXT_MUTED }}>your argument</label>
              <div className="relative group">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 cursor-help" style={{ color: TEXT_MUTED }}>
                  <path fillRule="evenodd" d="M15 8A7 7 0 1 1 1 8a7 7 0 0 1 14 0Zm-6-3.5a1 1 0 0 0-2 0v1a1 1 0 0 0 2 0v-1Zm0 4a1 1 0 0 0-2 0v3a1 1 0 0 0 2 0v-3Z" clipRule="evenodd" />
                </svg>
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-sm" style={{ background: CARD, color: TEXT_SECONDARY, border: "1px solid rgba(0,0,0,0.06)" }}>
                  insert a controversial thought or idea
                </div>
              </div>
            </div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="minimum wage should be raised to $20/hr because no one should work full-time and still be unable to afford rent..."
              rows={6}
              className="w-full rounded-xl px-4 py-3 text-sm resize-none focus:outline-none"
              style={{ background: "rgba(0,0,0,0.02)", border: "1px solid rgba(0,0,0,0.06)", color: TEXT_PRIMARY }}
            />
          </div>

          <button
            onClick={handleInject}
            disabled={!prompt.trim() || !targetId || loading}
            className="w-full py-3 rounded-xl text-sm font-medium transition-all disabled:opacity-25 disabled:cursor-not-allowed"
            style={{ background: TEXT_PRIMARY, color: CARD }}
          >
            {loading ? "simulating..." : "inject & watch"}
          </button>

          {error && (
            <div className="text-xs text-center px-3 py-2 rounded-lg" style={{ background: "rgba(200,80,80,0.08)", color: "#c05050" }}>
              {error}
            </div>
          )}

          <div className="mt-auto text-center">
            <span className="text-xs" style={{ color: TEXT_MUTED }}>25 agents &middot; 20 ticks &middot; 1 idea</span>
          </div>
        </div>
      </div>
    </div>
  );
}
