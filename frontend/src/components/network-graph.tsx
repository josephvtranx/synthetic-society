"use client";

import { useRef, useEffect, useCallback } from "react";
import { useSimStore, useCurrentAgents, useCurrentSnapshot } from "@/lib/store";
import { positionToColor, positionToColorRgb, BG_CANVAS } from "@/lib/colors";
import { drawTownBackground } from "@/lib/draw-houses";
import type { AgentShift, Propagation } from "@/lib/types";

type Expression = "idle" | "thinking" | "shifted" | "resistant";

function getExpression(agentId: string, shifts: AgentShift[], propagations: Propagation[]): Expression {
  if (shifts.find((s) => s.agent_id === agentId)) return "shifted";
  if (propagations.find((p) => p.to_id === agentId && p.resisted)) return "resistant";
  if (propagations.find((p) => p.to_id === agentId && !p.resisted)) return "thinking";
  return "idle";
}

type RenderState = {
  x: number;
  y: number;
  color: [number, number, number];
  expression: Expression;
  pulseAge: number;
  bobPhase: number;
  blinkTimer: number;
  blinking: boolean;
  lookAngle: number;
  lookTarget: number;
  shiftDelta: number;
  shiftSource: "direct" | "pressure" | null;
  shiftAge: number;
};

export default function NetworkGraph() {
  const agents = useCurrentAgents();
  const edges = useSimStore((s) => s.edges);
  const selectAgent = useSimStore((s) => s.selectAgent);
  const selectedAgentId = useSimStore((s) => s.selectedAgentId);
  const snapshot = useCurrentSnapshot();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);
  const lastTimeRef = useRef(0);
  const statesRef = useRef<Map<string, RenderState>>(new Map());
  const lastTickRef = useRef(-1);

  const shifts = snapshot?.shifts ?? [];
  const propagations = snapshot?.propagations ?? [];
  const currentTick = snapshot?.tick ?? 0;

  // Detect tick change
  if (currentTick !== lastTickRef.current) {
    lastTickRef.current = currentTick;
    for (const agent of agents) {
      const s = statesRef.current.get(agent.id);
      if (!s) continue;
      const shift = shifts.find((sh) => sh.agent_id === agent.id);
      const resisted = propagations.find((p) => p.to_id === agent.id && p.resisted);
      const pressured = propagations.find((p) => p.to_id === agent.id && !p.resisted);

      if (shift) {
        s.expression = "shifted";
        s.pulseAge = 0;
        s.shiftDelta = shift.delta;
        s.shiftSource = shift.source;
        s.shiftAge = 0;
      } else if (resisted) {
        s.expression = "resistant";
        s.shiftAge = 0;
      } else if (pressured) {
        s.expression = "thinking";
        s.shiftAge = 0;
      } else {
        s.expression = "idle";
        s.shiftDelta = 0;
        s.shiftSource = null;
        s.shiftAge = -1;
      }
    }
  }

  const draw = useCallback(
    (time: number) => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) {
        animRef.current = requestAnimationFrame(draw);
        return;
      }

      const dt = lastTimeRef.current ? Math.min((time - lastTimeRef.current) / 1000, 0.05) : 0.016;
      lastTimeRef.current = time;

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

      // Background
      ctx.fillStyle = BG_CANVAS;
      ctx.fillRect(0, 0, w, h);

      // Draw town
      drawTownBackground(ctx, w, h);

      const pad = 80;
      const gw = w - pad * 2;
      const gh = h - pad * 2;
      const states = statesRef.current;

      // Init/update render states
      for (const agent of agents) {
        let s = states.get(agent.id);
        if (!s) {
          s = {
            x: agent.x, y: agent.y,
            color: positionToColorRgb(agent.position),
            expression: "idle", pulseAge: -1,
            bobPhase: Math.random() * Math.PI * 2,
            blinkTimer: 2 + Math.random() * 4, blinking: false,
            lookAngle: 0, lookTarget: 0,
            shiftDelta: 0, shiftSource: null, shiftAge: -1,
          };
          states.set(agent.id, s);
        }
        s.color = positionToColorRgb(agent.position);

        // Smooth lerp
        s.x += (agent.x - s.x) * Math.min(1, dt * 3);
        s.y += (agent.y - s.y) * Math.min(1, dt * 3);
        s.bobPhase += dt * 1.6;
        s.blinkTimer -= dt;
        if (s.blinkTimer <= 0) {
          s.blinking = !s.blinking;
          s.blinkTimer = s.blinking ? 0.12 : 2.5 + Math.random() * 4;
        }
        s.lookAngle += (s.lookTarget - s.lookAngle) * dt * 2;
        if (Math.abs(s.lookAngle - s.lookTarget) < 0.1) {
          s.lookTarget = (Math.random() - 0.5) * 0.5;
        }
        if (s.pulseAge >= 0) s.pulseAge += dt;
        if (s.shiftAge >= 0) s.shiftAge += dt;
        if (s.shiftAge > 3 && s.expression !== "idle") s.expression = "idle";
      }

      // Draw edges
      for (const edge of edges) {
        const sa = states.get(edge.source);
        const sb = states.get(edge.target);
        if (!sa || !sb) continue;
        const ax = pad + sa.x * gw;
        const ay = pad + sa.y * gh;
        const bx = pad + sb.x * gw;
        const by = pad + sb.y * gh;

        const prop = propagations.find(
          (p) => (p.from_id === edge.source && p.to_id === edge.target) ||
                 (p.from_id === edge.target && p.to_id === edge.source)
        );

        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);

        if (prop && sa.shiftAge >= 0 && sa.shiftAge < 2) {
          const flash = Math.max(0, 1 - sa.shiftAge / 2);
          ctx.strokeStyle = prop.resisted
            ? `rgba(200,100,100,${0.08 + flash * 0.25})`
            : `rgba(80,80,100,${0.06 + flash * 0.3})`;
          ctx.lineWidth = 1 + flash * 2;
        } else {
          ctx.strokeStyle = "rgba(0,0,0,0.05)";
          ctx.lineWidth = 0.8;
        }
        ctx.stroke();
      }

      // Draw agents
      for (const agent of agents) {
        const s = states.get(agent.id);
        if (!s) continue;

        const baseX = pad + s.x * gw;
        const bob = Math.sin(s.bobPhase) * 1.8;
        const baseY = pad + s.y * gh + bob;
        const isSelected = agent.id === selectedAgentId;
        const radius = 14;

        let drawX = baseX;
        if (s.expression === "thinking") drawX += Math.sin(s.bobPhase * 3) * 2.5;
        if (s.expression === "resistant" && s.shiftAge >= 0 && s.shiftAge < 0.5) {
          drawX += Math.sin(s.shiftAge * 40) * 3 * (1 - s.shiftAge * 2);
        }

        // Pulse
        if (s.pulseAge >= 0 && s.pulseAge < 1.5) {
          const pr = radius + s.pulseAge * 28;
          const pa = Math.max(0, 1 - s.pulseAge / 1.5);
          ctx.beginPath();
          ctx.arc(drawX, baseY, pr, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(60,60,80,${pa * 0.2})`;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        // Shadow
        ctx.beginPath();
        ctx.ellipse(baseX, pad + s.y * gh + radius + 5, radius * 0.65, 3, 0, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(0,0,0,0.08)";
        ctx.fill();

        // Body
        ctx.beginPath();
        ctx.arc(drawX, baseY, radius, 0, Math.PI * 2);
        const [cr, cg, cb] = s.color;
        ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(${Math.max(0, cr - 40)},${Math.max(0, cg - 40)},${Math.max(0, cb - 40)},0.3)`;
        ctx.lineWidth = 1;
        ctx.stroke();

        // White highlight (top-left)
        ctx.beginPath();
        ctx.arc(drawX - radius * 0.25, baseY - radius * 0.3, radius * 0.35, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.25)";
        ctx.fill();

        // Selection
        if (isSelected) {
          ctx.beginPath();
          ctx.arc(drawX, baseY, radius + 3, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(60,60,80,0.5)";
          ctx.lineWidth = 1.5;
          ctx.setLineDash([3, 3]);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // --- Face ---
        const eyeY = baseY - 2;
        const es = 4.5;
        const look = s.lookAngle * 1.2;

        if (s.blinking && s.expression === "idle") {
          ctx.strokeStyle = "#3a3a40";
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(drawX - es - 1.5 + look, eyeY);
          ctx.lineTo(drawX - es + 1.5 + look, eyeY);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(drawX + es - 1.5 + look, eyeY);
          ctx.lineTo(drawX + es + 1.5 + look, eyeY);
          ctx.stroke();
        } else if (s.expression === "resistant") {
          ctx.fillStyle = "#3a3a40";
          ctx.beginPath();
          ctx.ellipse(drawX - es, eyeY, 2.5, 1, -0.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.ellipse(drawX + es, eyeY, 2.5, 1, 0.2, 0, Math.PI * 2);
          ctx.fill();
        } else if (s.expression === "shifted") {
          ctx.fillStyle = "#3a3a40";
          ctx.beginPath();
          ctx.arc(drawX - es, eyeY, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(drawX + es, eyeY, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "rgba(255,255,255,0.5)";
          ctx.beginPath();
          ctx.arc(drawX - es + 1, eyeY - 1, 1, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(drawX + es + 1, eyeY - 1, 1, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = "#3a3a40";
          ctx.beginPath();
          ctx.arc(drawX - es + look, eyeY, 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(drawX + es + look, eyeY, 2, 0, Math.PI * 2);
          ctx.fill();
        }

        // Mouth
        const mouthY = baseY + 4;
        ctx.strokeStyle = "#3a3a40";
        ctx.lineWidth = 1.2;
        ctx.lineCap = "round";

        if (s.expression === "shifted") {
          ctx.beginPath();
          ctx.arc(drawX, mouthY, 2.5, 0, Math.PI * 2);
          ctx.stroke();
        } else if (s.expression === "resistant") {
          ctx.beginPath();
          ctx.arc(drawX, mouthY + 3, 4, Math.PI * 1.25, Math.PI * 1.75);
          ctx.stroke();
        } else if (s.expression === "thinking") {
          ctx.beginPath();
          ctx.moveTo(drawX - 4, mouthY);
          ctx.bezierCurveTo(drawX - 2, mouthY - 2, drawX + 2, mouthY + 2, drawX + 4, mouthY);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(drawX, mouthY - 1, 3.5, Math.PI * 0.15, Math.PI * 0.85);
          ctx.stroke();
        }
        ctx.lineCap = "butt";

        // Name
        ctx.font = "11px 'Inter', system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(40,40,50,0.5)";
        ctx.fillText(agent.name.split(" ")[0], baseX, baseY + radius + 16);

        // Shift indicator
        if (s.shiftAge >= 0 && s.shiftAge < 2.5 && s.shiftDelta !== 0) {
          const fadeIn = Math.min(1, s.shiftAge * 4);
          const fadeOut = Math.max(0, 1 - (s.shiftAge - 1.5));
          const alpha = Math.min(fadeIn, fadeOut);
          const floatUp = s.shiftAge * 8;
          const sign = s.shiftDelta > 0 ? "+" : "";
          ctx.font = "bold 10px 'Inter', system-ui, sans-serif";
          ctx.fillStyle = s.shiftSource === "direct"
            ? `rgba(58,158,106,${alpha})`
            : `rgba(212,133,58,${alpha})`;
          ctx.fillText(`${sign}${s.shiftDelta.toFixed(2)}`, baseX, baseY - radius - 8 - floatUp);
        }
      }

      animRef.current = requestAnimationFrame(draw);
    },
    [agents, edges, selectedAgentId, shifts, propagations],
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
    const pad = 80;
    const gw = container.clientWidth - pad * 2;
    const gh = container.clientHeight - pad * 2;

    for (const agent of agents) {
      const s = statesRef.current.get(agent.id);
      if (!s) continue;
      const ax = pad + s.x * gw;
      const ay = pad + s.y * gh;
      if (Math.sqrt((mx - ax) ** 2 + (my - ay) ** 2) < 20) {
        selectAgent(agent.id);
        return;
      }
    }
    selectAgent(null);
  }

  return (
    <div ref={containerRef} className="flex-1 relative" style={{ background: BG_CANVAS }}>
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        className="absolute inset-0 w-full h-full cursor-pointer"
      />
    </div>
  );
}
