"use client";

import { useRef, useEffect, useCallback } from "react";
import { useSimStore, useCurrentAgents, useCurrentSnapshot, useCurrentConversations } from "@/lib/store";
import { positionToColorRgb, BG_CANVAS } from "@/lib/colors";
import { drawTownBackground } from "@/lib/draw-houses";
type Expression = "idle" | "thinking" | "shifted" | "resistant";

type RenderState = {
  x: number;
  y: number;
  color: [number, number, number];
  expression: Expression;
  pulseAge: number;
  walkPhase: number;
  blinkTimer: number;
  blinking: boolean;
  lookAngle: number;
  lookTarget: number;
  shiftDelta: number;
  shiftSource: "direct" | "pressure" | null;
  shiftAge: number;
  speechBubble: { text: string; age: number } | null;
};

// Stick figure dimensions
const HEAD_R = 7;
const BODY_LEN = 10;
const LEG_LEN = 8;
const LEG_SPREAD = 5;
const OUTLINE = 2;

function drawStickFigure(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number, // center of head
  fill: [number, number, number],
  expression: Expression,
  blinking: boolean,
  lookAngle: number,
  walkPhase: number,
  isSelected: boolean,
  isTarget: boolean,
  shiftAge: number,
  shiftDelta: number,
  name: string,
) {
  const neckY = y + HEAD_R;
  const hipY = neckY + BODY_LEN;
  const footY = hipY + LEG_LEN;

  // Selection ring
  if (isSelected && !isTarget) {
    ctx.beginPath();
    ctx.arc(x, y, HEAD_R + 5, 0, Math.PI * 2);
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Target indicator
  if (isTarget) {
    ctx.beginPath();
    ctx.arc(x, y, HEAD_R + 6, 0, Math.PI * 2);
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 2.5;
    ctx.stroke();
    // Crosshair ticks
    const cr = HEAD_R + 6;
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(angle) * (cr - 2), y + Math.sin(angle) * (cr - 2));
      ctx.lineTo(x + Math.cos(angle) * (cr + 4), y + Math.sin(angle) * (cr + 4));
      ctx.stroke();
    }
  }

  // Legs — slight walk cycle
  const legSwing = Math.sin(walkPhase) * 2;
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = OUTLINE;
  ctx.lineCap = "round";

  // Left leg
  ctx.beginPath();
  ctx.moveTo(x, hipY);
  ctx.lineTo(x - LEG_SPREAD + legSwing, footY);
  ctx.stroke();

  // Right leg
  ctx.beginPath();
  ctx.moveTo(x, hipY);
  ctx.lineTo(x + LEG_SPREAD - legSwing, footY);
  ctx.stroke();

  // Body
  ctx.beginPath();
  ctx.moveTo(x, neckY);
  ctx.lineTo(x, hipY);
  ctx.stroke();

  // Arms — slight swing opposite to legs
  const armSwing = Math.sin(walkPhase + Math.PI) * 3;
  const armY = neckY + 3;
  const armLen = 7;

  ctx.beginPath();
  ctx.moveTo(x, armY);
  ctx.lineTo(x - 6 + armSwing, armY + armLen);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x, armY);
  ctx.lineTo(x + 6 - armSwing, armY + armLen);
  ctx.stroke();

  // Head — filled circle with black outline
  ctx.beginPath();
  ctx.arc(x, y, HEAD_R, 0, Math.PI * 2);
  const [cr2, cg, cb] = fill;
  ctx.fillStyle = `rgb(${cr2},${cg},${cb})`;
  ctx.fill();
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = OUTLINE;
  ctx.stroke();

  // --- Face ---
  const eyeY = y - 1;
  const eyeSpacing = 3.5;

  if (blinking && expression === "idle") {
    // Blink — horizontal lines
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - eyeSpacing - 1.5, eyeY);
    ctx.lineTo(x - eyeSpacing + 1.5, eyeY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + eyeSpacing - 1.5, eyeY);
    ctx.lineTo(x + eyeSpacing + 1.5, eyeY);
    ctx.stroke();
  } else if (expression === "resistant") {
    // Squinting — narrow ellipses
    ctx.fillStyle = "#1a1a1a";
    ctx.beginPath();
    ctx.ellipse(x - eyeSpacing, eyeY, 2, 1, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x + eyeSpacing, eyeY, 2, 1, 0.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (expression === "shifted") {
    // Wide eyes — bigger dots
    ctx.fillStyle = "#1a1a1a";
    ctx.beginPath();
    ctx.arc(x - eyeSpacing, eyeY, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + eyeSpacing, eyeY, 2.5, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Normal — dot eyes with slight look direction
    ctx.fillStyle = "#1a1a1a";
    const look = lookAngle * 1;
    ctx.beginPath();
    ctx.arc(x - eyeSpacing + look, eyeY, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + eyeSpacing + look, eyeY, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Mouth
  const mouthY = y + 3;
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 1.2;
  ctx.lineCap = "round";

  if (expression === "shifted") {
    // O mouth
    ctx.beginPath();
    ctx.arc(x, mouthY, 2, 0, Math.PI * 2);
    ctx.stroke();
  } else if (expression === "resistant") {
    // Frown
    ctx.beginPath();
    ctx.arc(x, mouthY + 2.5, 3, Math.PI * 1.25, Math.PI * 1.75);
    ctx.stroke();
  } else if (expression === "thinking") {
    // Wavy mouth
    ctx.beginPath();
    ctx.moveTo(x - 3, mouthY);
    ctx.bezierCurveTo(x - 1.5, mouthY - 1.5, x + 1.5, mouthY + 1.5, x + 3, mouthY);
    ctx.stroke();
  } else {
    // Smile
    ctx.beginPath();
    ctx.arc(x, mouthY - 0.5, 3, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
  }
  ctx.lineCap = "butt";

  // Name — below feet
  ctx.font = "bold 9px 'Courier New', monospace";
  ctx.textAlign = "center";
  ctx.fillStyle = "#1a1a1a";
  ctx.fillText(name.split(" ")[0].toUpperCase(), x, footY + 12);

  // Shift indicator — floating number
  if (shiftAge >= 0 && shiftAge < 2.5 && shiftDelta !== 0) {
    const fadeIn = Math.min(1, shiftAge * 4);
    const fadeOut = Math.max(0, 1 - (shiftAge - 1.5));
    const alpha = Math.min(fadeIn, fadeOut);
    const floatUp = shiftAge * 8;
    const sign = shiftDelta > 0 ? "+" : "";
    ctx.font = "bold 10px 'Courier New', monospace";
    ctx.fillStyle = `rgba(26,26,26,${alpha})`;
    const labelOffset = isTarget ? 18 : 10;
    ctx.fillText(`${sign}${shiftDelta.toFixed(2)}`, x, y - HEAD_R - labelOffset - floatUp);
  }
}

export default function NetworkGraph() {
  const agents = useCurrentAgents();
  const edges = useSimStore((s) => s.edges);
  const selectAgent = useSimStore((s) => s.selectAgent);
  const selectedAgentId = useSimStore((s) => s.selectedAgentId);
  const targetAgentId = useSimStore((s) => s.timeline?.target_agent_id ?? null);
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

  const conversations = snapshot?.conversations ?? [];

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

      // Set speech bubbles from conversations
      const asFrom = conversations.find((c) => c.from_id === agent.id);
      const asTo = conversations.find((c) => c.to_id === agent.id);
      if (asFrom) {
        const words = asFrom.speaker_message.split(" ").slice(0, 5).join(" ");
        s.speechBubble = { text: words + (asFrom.speaker_message.split(" ").length > 5 ? "..." : ""), age: 0 };
      } else if (asTo) {
        const words = asTo.listener_response.split(" ").slice(0, 4).join(" ");
        s.speechBubble = { text: words + (asTo.listener_response.split(" ").length > 4 ? "..." : ""), age: 0 };
      } else {
        s.speechBubble = null;
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

      // Background — clean white
      ctx.fillStyle = BG_CANVAS;
      ctx.fillRect(0, 0, w, h);

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
            walkPhase: Math.random() * Math.PI * 2,
            blinkTimer: 2 + Math.random() * 4, blinking: false,
            lookAngle: 0, lookTarget: 0,
            shiftDelta: 0, shiftSource: null, shiftAge: -1, speechBubble: null,
          };
          states.set(agent.id, s);
        }
        s.color = positionToColorRgb(agent.position);

        // Smooth lerp
        s.x += (agent.x - s.x) * Math.min(1, dt * 3);
        s.y += (agent.y - s.y) * Math.min(1, dt * 3);
        s.walkPhase += dt * 1.2;
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
        if (s.speechBubble) {
          s.speechBubble.age += dt;
          if (s.speechBubble.age > 2.5) s.speechBubble = null;
        }
      }

      // Draw edges — simple thin black lines
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
          ctx.strokeStyle = `rgba(26,26,26,${0.06 + flash * 0.3})`;
          ctx.lineWidth = 1 + flash * 2;
        } else {
          ctx.strokeStyle = "rgba(0,0,0,0.06)";
          ctx.lineWidth = 0.8;
        }
        ctx.stroke();
      }

      // Draw agents as stick figures
      for (const agent of agents) {
        const s = states.get(agent.id);
        if (!s) continue;

        const baseX = pad + s.x * gw;
        const baseY = pad + s.y * gh;
        const isSelected = agent.id === selectedAgentId;
        const isTarget = agent.id === targetAgentId;

        let drawX = baseX;
        // Thinking wobble
        if (s.expression === "thinking") drawX += Math.sin(s.walkPhase * 3) * 2;
        // Resistant shake
        if (s.expression === "resistant" && s.shiftAge >= 0 && s.shiftAge < 0.5) {
          drawX += Math.sin(s.shiftAge * 40) * 3 * (1 - s.shiftAge * 2);
        }

        // Pulse ring on shift
        if (s.pulseAge >= 0 && s.pulseAge < 1.5) {
          const pr = HEAD_R + s.pulseAge * 25;
          const pa = Math.max(0, 1 - s.pulseAge / 1.5);
          ctx.beginPath();
          ctx.arc(drawX, baseY, pr, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(26,26,26,${pa * 0.25})`;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        drawStickFigure(
          ctx, drawX, baseY,
          s.color, s.expression, s.blinking,
          s.lookAngle, s.walkPhase,
          isSelected, isTarget,
          s.shiftAge, s.shiftDelta,
          agent.name,
        );

        // Speech bubble
        if (s.speechBubble) {
          const bubble = s.speechBubble;
          const fadeIn = Math.min(1, bubble.age / 0.3);
          const fadeOut = bubble.age > 1.8 ? Math.max(0, 1 - (bubble.age - 1.8) / 0.7) : 1;
          const alpha = fadeIn * fadeOut;
          if (alpha > 0) {
            ctx.font = "8px 'Courier New', monospace";
            const textW = ctx.measureText(bubble.text).width;
            const bw = textW + 10;
            const bh = 16;
            const bx = drawX - bw / 2;
            const by = baseY - HEAD_R - 24 - bh;

            ctx.globalAlpha = alpha;
            ctx.fillStyle = "#ffffff";
            ctx.strokeStyle = "#1a1a1a";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.rect(bx, by, bw, bh);
            ctx.fill();
            ctx.stroke();

            // Tail
            ctx.beginPath();
            ctx.moveTo(drawX - 3, by + bh);
            ctx.lineTo(drawX, by + bh + 5);
            ctx.lineTo(drawX + 3, by + bh);
            ctx.fillStyle = "#ffffff";
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(drawX - 3, by + bh);
            ctx.lineTo(drawX, by + bh + 5);
            ctx.lineTo(drawX + 3, by + bh);
            ctx.strokeStyle = "#1a1a1a";
            ctx.lineWidth = 1.5;
            ctx.stroke();
            // Cover tail-box seam
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(drawX - 3, by + bh - 1, 6, 2);

            ctx.fillStyle = "#1a1a1a";
            ctx.textAlign = "center";
            ctx.fillText(bubble.text, drawX, by + 11);
            ctx.globalAlpha = 1;
          }
        }
      }

      animRef.current = requestAnimationFrame(draw);
    },
    [agents, edges, selectedAgentId, targetAgentId, shifts, propagations, conversations],
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
      if (Math.sqrt((mx - ax) ** 2 + (my - ay) ** 2) < 25) {
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
