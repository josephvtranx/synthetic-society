"use client";

import { useRef, useEffect, useCallback } from "react";
import { useSimStore, useCurrentAgents, useCurrentSnapshot } from "@/lib/store";
import { positionToColorRgb, BG_CANVAS } from "@/lib/colors";
import { drawTownBackground } from "@/lib/draw-houses";

type Expression = "idle" | "thinking" | "shifted" | "resistant";

type Particle = {
  x: number; y: number;
  vx: number; vy: number;
  life: number; maxLife: number;
  size: number;
};

type RenderState = {
  x: number; y: number;
  targetX: number; targetY: number; // conversation walk target
  homeX: number; homeY: number;     // original position
  color: [number, number, number];
  prevColor: [number, number, number];
  colorFlashAge: number;
  expression: Expression;
  pulseAge: number;
  walkPhase: number;
  walkSpeed: number;
  blinkTimer: number; blinking: boolean;
  lookAngle: number; lookTarget: number;
  shiftDelta: number;
  shiftSource: "argument" | "direct" | "pressure" | "event" | null;
  shiftAge: number;
  speechBubble: { text: string; age: number } | null;
  bounceY: number;       // vertical bounce offset
  bounceVel: number;     // bounce velocity
  squash: number;        // squash/stretch factor (1 = normal)
  convoPartnerId: string | null;
  convoAge: number;
  isWalking: boolean;
};

// Stick figure dimensions
const HEAD_R = 7;
const BODY_LEN = 10;
const LEG_LEN = 8;
const LEG_SPREAD = 5;
const OUTLINE = 2;

// How far agents walk toward each other (0-1, fraction of distance)
const CONVO_WALK_FRACTION = 0.25;
const WALK_SPEED = 4; // lerp speed

function drawStickFigure(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  fill: [number, number, number],
  prevFill: [number, number, number],
  colorFlashAge: number,
  expression: Expression,
  blinking: boolean,
  lookAngle: number,
  walkPhase: number,
  isSelected: boolean,
  isTarget: boolean,
  shiftAge: number,
  shiftDelta: number,
  squash: number,
  name: string,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1 / squash, squash); // squash horizontally, stretch vertically (inverted for bounce)

  const headY = 0;
  const neckY = HEAD_R;
  const hipY = neckY + BODY_LEN;
  const footY = hipY + LEG_LEN;

  // Selection ring
  if (isSelected && !isTarget) {
    ctx.beginPath();
    ctx.arc(0, headY, HEAD_R + 5, 0, Math.PI * 2);
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Target indicator — spinning crosshair
  if (isTarget) {
    const spin = Date.now() / 1500;
    ctx.beginPath();
    ctx.arc(0, headY, HEAD_R + 6, 0, Math.PI * 2);
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 2.5;
    ctx.stroke();
    const cr = HEAD_R + 6;
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2 + spin;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * (cr - 2), headY + Math.sin(angle) * (cr - 2));
      ctx.lineTo(Math.cos(angle) * (cr + 4), headY + Math.sin(angle) * (cr + 4));
      ctx.stroke();
    }
  }

  // Legs — walk cycle
  const isWalking = Math.abs(Math.sin(walkPhase) * walkPhase) > 0.01;
  const legSwing = Math.sin(walkPhase) * (isWalking ? 4 : 2);
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = OUTLINE;
  ctx.lineCap = "round";

  ctx.beginPath(); ctx.moveTo(0, hipY); ctx.lineTo(-LEG_SPREAD + legSwing, footY); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, hipY); ctx.lineTo(LEG_SPREAD - legSwing, footY); ctx.stroke();

  // Body
  ctx.beginPath(); ctx.moveTo(0, neckY); ctx.lineTo(0, hipY); ctx.stroke();

  // Arms — swing + gesticulate when talking
  const armSwing = Math.sin(walkPhase + Math.PI) * (expression === "thinking" ? 6 : 3);
  const armY = neckY + 3;
  const armLen = 7;
  const gestureUp = expression === "shifted" && shiftAge < 1 ? -3 : 0;

  ctx.beginPath(); ctx.moveTo(0, armY); ctx.lineTo(-6 + armSwing, armY + armLen + gestureUp); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, armY); ctx.lineTo(6 - armSwing, armY + armLen + gestureUp); ctx.stroke();

  // Head — filled with color flash on shift
  ctx.beginPath();
  ctx.arc(0, headY, HEAD_R, 0, Math.PI * 2);
  let [r, g, b] = fill;
  if (colorFlashAge >= 0 && colorFlashAge < 0.6) {
    // Flash white then to new color
    const flash = Math.max(0, 1 - colorFlashAge / 0.3);
    r = Math.round(r + (255 - r) * flash);
    g = Math.round(g + (255 - g) * flash);
    b = Math.round(b + (255 - b) * flash);
  }
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fill();
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = OUTLINE;
  ctx.stroke();

  // --- Face ---
  const eyeY = headY - 1;
  const eyeSpacing = 3.5;

  if (blinking && expression === "idle") {
    ctx.strokeStyle = "#1a1a1a"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-eyeSpacing - 1.5, eyeY); ctx.lineTo(-eyeSpacing + 1.5, eyeY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(eyeSpacing - 1.5, eyeY); ctx.lineTo(eyeSpacing + 1.5, eyeY); ctx.stroke();
  } else if (expression === "resistant") {
    // X eyes when resistant
    ctx.strokeStyle = "#1a1a1a"; ctx.lineWidth = 1.5;
    for (const side of [-1, 1]) {
      const ex = side * eyeSpacing;
      ctx.beginPath(); ctx.moveTo(ex - 1.5, eyeY - 1.5); ctx.lineTo(ex + 1.5, eyeY + 1.5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ex + 1.5, eyeY - 1.5); ctx.lineTo(ex - 1.5, eyeY + 1.5); ctx.stroke();
    }
  } else if (expression === "shifted") {
    // Star eyes when shifted!
    ctx.fillStyle = "#1a1a1a";
    for (const side of [-1, 1]) {
      const ex = side * eyeSpacing;
      const starR = 2.5;
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const angle = -Math.PI / 2 + (i * Math.PI * 2) / 5;
        const outerX = ex + Math.cos(angle) * starR;
        const outerY = eyeY + Math.sin(angle) * starR;
        const innerAngle = angle + Math.PI / 5;
        const innerX = ex + Math.cos(innerAngle) * (starR * 0.4);
        const innerY = eyeY + Math.sin(innerAngle) * (starR * 0.4);
        if (i === 0) ctx.moveTo(outerX, outerY);
        else ctx.lineTo(outerX, outerY);
        ctx.lineTo(innerX, innerY);
      }
      ctx.closePath(); ctx.fill();
    }
  } else {
    // Normal eyes with look direction
    ctx.fillStyle = "#1a1a1a";
    const look = lookAngle * 1;
    ctx.beginPath(); ctx.arc(-eyeSpacing + look, eyeY, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(eyeSpacing + look, eyeY, 1.5, 0, Math.PI * 2); ctx.fill();
  }

  // Mouth
  const mouthY = headY + 3;
  ctx.strokeStyle = "#1a1a1a"; ctx.lineWidth = 1.2; ctx.lineCap = "round";
  if (expression === "shifted") {
    ctx.beginPath(); ctx.arc(0, mouthY, 2.5, 0, Math.PI * 2); ctx.stroke(); // big O mouth
  } else if (expression === "resistant") {
    ctx.beginPath(); ctx.arc(0, mouthY + 2.5, 3, Math.PI * 1.2, Math.PI * 1.8); ctx.stroke();
  } else if (expression === "thinking") {
    // Animated wavy mouth
    const wave = Math.sin(Date.now() / 200) * 1.5;
    ctx.beginPath();
    ctx.moveTo(-3, mouthY);
    ctx.bezierCurveTo(-1.5, mouthY - wave, 1.5, mouthY + wave, 3, mouthY);
    ctx.stroke();
  } else {
    ctx.beginPath(); ctx.arc(0, mouthY - 0.5, 3, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
  }
  ctx.lineCap = "butt";

  // Thinking dots (... above head)
  if (expression === "thinking") {
    const dotPhase = Date.now() / 300;
    for (let i = 0; i < 3; i++) {
      const dotY = headY - HEAD_R - 10 - Math.sin(dotPhase + i * 0.8) * 3;
      const dotAlpha = 0.3 + Math.sin(dotPhase + i * 1.2) * 0.3;
      ctx.fillStyle = `rgba(26,26,26,${dotAlpha})`;
      ctx.beginPath();
      ctx.arc(-4 + i * 4, dotY, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Exclamation mark on big shift
  if (shiftAge >= 0 && shiftAge < 1.5 && Math.abs(shiftDelta) > 0.015) {
    const exAlpha = Math.max(0, 1 - shiftAge / 1.5);
    const exScale = 1 + Math.max(0, 0.5 - shiftAge) * 2; // pop in
    ctx.save();
    ctx.globalAlpha = exAlpha;
    ctx.translate(HEAD_R + 6, headY - 4);
    ctx.scale(exScale, exScale);
    ctx.font = "bold 12px 'Courier New', monospace";
    ctx.fillStyle = "#1a1a1a";
    ctx.textAlign = "center";
    ctx.fillText("!", 0, 0);
    ctx.restore();
  }

  ctx.restore(); // undo the squash transform

  // Name — below feet (outside squash transform)
  const footYAbs = y + (HEAD_R + BODY_LEN + LEG_LEN) * squash;
  ctx.font = "bold 9px 'Courier New', monospace";
  ctx.textAlign = "center";
  ctx.fillStyle = "#1a1a1a";
  ctx.fillText(name.split(" ")[0].toUpperCase(), x, footYAbs + 12);

  // Shift indicator — floating number
  if (shiftAge >= 0 && shiftAge < 2.5 && shiftDelta !== 0) {
    const fadeIn = Math.min(1, shiftAge * 4);
    const fadeOut = Math.max(0, 1 - (shiftAge - 1.5));
    const alpha = Math.min(fadeIn, fadeOut);
    const floatUp = shiftAge * 12;
    const sign = shiftDelta > 0 ? "+" : "";
    ctx.font = "bold 11px 'Courier New', monospace";
    ctx.fillStyle = `rgba(26,26,26,${alpha})`;
    const labelOffset = isTarget ? 20 : 14;
    ctx.fillText(`${sign}${shiftDelta.toFixed(2)}`, x, y - HEAD_R - labelOffset - floatUp);
  }
}

// Draw animated dashed line between two talking agents with traveling particles
function drawConversationEdge(
  ctx: CanvasRenderingContext2D,
  ax: number, ay: number, bx: number, by: number,
  age: number,
) {
  const dashOffset = -age * 80; // animated dash
  ctx.save();
  ctx.setLineDash([6, 4]);
  ctx.lineDashOffset = dashOffset;
  ctx.strokeStyle = `rgba(26,26,26,0.5)`;
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // Traveling dot along the edge
  const t = (age * 1.5) % 1;
  const dx = ax + (bx - ax) * t;
  const dy = ay + (by - ay) * t;
  ctx.beginPath();
  ctx.arc(dx, dy, 3, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(26,26,26,0.6)";
  ctx.fill();

  // Reverse dot
  const t2 = ((age * 1.5) + 0.5) % 1;
  const dx2 = bx + (ax - bx) * t2;
  const dy2 = by + (ay - by) * t2;
  ctx.beginPath();
  ctx.arc(dx2, dy2, 2.5, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(26,26,26,0.4)";
  ctx.fill();
}

export default function NetworkGraph() {
  const agents = useCurrentAgents();
  const edges = useSimStore((s) => s.edges);
  const selectAgent = useSimStore((s) => s.selectAgent);
  const selectedAgentId = useSimStore((s) => s.selectedAgentId);
  const targetAgentIds = useSimStore((s) => s.targetAgentIds);
  const snapshot = useCurrentSnapshot();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);
  const lastTimeRef = useRef(0);
  const statesRef = useRef<Map<string, RenderState>>(new Map());
  const particlesRef = useRef<Particle[]>([]);
  const lastTickRef = useRef(-1);

  const shifts = snapshot?.shifts ?? [];
  const currentTick = snapshot?.tick ?? 0;
  const conversations = snapshot?.conversations ?? [];

  // Detect tick change — set up animation states
  if (currentTick !== lastTickRef.current) {
    lastTickRef.current = currentTick;

    // Build conversation partner map
    const partnerMap = new Map<string, string>();
    for (const c of conversations) {
      partnerMap.set(c.from_id, c.to_id);
      partnerMap.set(c.to_id, c.from_id);
    }

    for (const agent of agents) {
      const s = statesRef.current.get(agent.id);
      if (!s) continue;
      const shift = shifts.find((sh) => sh.agent_id === agent.id);
      const inConvo = conversations.find((c) => c.from_id === agent.id || c.to_id === agent.id);

      // Save home position
      s.homeX = agent.x;
      s.homeY = agent.y;

      if (shift) {
        s.expression = "shifted";
        s.pulseAge = 0;
        s.prevColor = [...s.color] as [number, number, number];
        s.colorFlashAge = 0;
        s.shiftDelta = shift.delta;
        s.shiftSource = shift.source;
        s.shiftAge = 0;
        // Bounce!
        s.bounceVel = -4 - Math.min(Math.abs(shift.delta) * 80, 6);
        s.squash = 0.85; // initial squash on landing
      } else if (inConvo) {
        s.expression = "thinking";
        s.shiftAge = 0;
      } else {
        s.expression = "idle";
        s.shiftDelta = 0;
        s.shiftSource = null;
        s.shiftAge = -1;
      }

      // Walk toward conversation partner
      const partnerId = partnerMap.get(agent.id);
      s.convoPartnerId = partnerId ?? null;
      s.convoAge = 0;
      if (partnerId) {
        const partner = agents.find((a) => a.id === partnerId);
        if (partner) {
          s.targetX = agent.x + (partner.x - agent.x) * CONVO_WALK_FRACTION;
          s.targetY = agent.y + (partner.y - agent.y) * CONVO_WALK_FRACTION;
          s.isWalking = true;
          s.walkSpeed = 3 + Math.random() * 2;
          // Look at partner
          s.lookTarget = partner.x > agent.x ? 0.5 : -0.5;
        }
      } else {
        s.targetX = agent.x;
        s.targetY = agent.y;
        s.isWalking = false;
      }

      // Speech bubbles
      const asFrom = conversations.find((c) => c.from_id === agent.id);
      const asTo = conversations.find((c) => c.to_id === agent.id);
      if (asFrom) {
        const words = asFrom.speaker_message.split(" ").slice(0, 4).join(" ");
        s.speechBubble = { text: words + (asFrom.speaker_message.split(" ").length > 4 ? "..." : ""), age: 0 };
      } else if (asTo) {
        const words = asTo.listener_response.split(" ").slice(0, 3).join(" ");
        s.speechBubble = { text: words + (asTo.listener_response.split(" ").length > 3 ? "..." : ""), age: 0 };
      } else {
        s.speechBubble = null;
      }

      // Spawn particles on big shifts
      if (shift && Math.abs(shift.delta) > 0.01) {
        const count = Math.min(12, Math.floor(Math.abs(shift.delta) * 200));
        for (let i = 0; i < count; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 20 + Math.random() * 40;
          particlesRef.current.push({
            x: 0, y: 0, // will be set in screen coords during draw
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 20,
            life: 0, maxLife: 0.6 + Math.random() * 0.6,
            size: 1.5 + Math.random() * 2,
          });
          // Tag with agent position (hack: store in x,y initially)
          const p = particlesRef.current[particlesRef.current.length - 1];
          (p as any)._agentId = agent.id;
        }
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

      ctx.fillStyle = BG_CANVAS;
      ctx.fillRect(0, 0, w, h);
      drawTownBackground(ctx, w, h);

      const pad = 80;
      const gw = w - pad * 2;
      const gh = h - pad * 2;
      const states = statesRef.current;

      // --- Update render states ---
      for (const agent of agents) {
        let s = states.get(agent.id);
        if (!s) {
          s = {
            x: agent.x, y: agent.y,
            targetX: agent.x, targetY: agent.y,
            homeX: agent.x, homeY: agent.y,
            color: positionToColorRgb(agent.position),
            prevColor: positionToColorRgb(agent.position),
            colorFlashAge: -1,
            expression: "idle", pulseAge: -1,
            walkPhase: Math.random() * Math.PI * 2,
            walkSpeed: 1.2,
            blinkTimer: 2 + Math.random() * 4, blinking: false,
            lookAngle: 0, lookTarget: 0,
            shiftDelta: 0, shiftSource: null, shiftAge: -1,
            speechBubble: null,
            bounceY: 0, bounceVel: 0, squash: 1,
            convoPartnerId: null, convoAge: 0, isWalking: false,
          };
          states.set(agent.id, s);
        }
        s.color = positionToColorRgb(agent.position);

        // Walk toward target (conversation partner or home)
        const walkLerp = Math.min(1, dt * s.walkSpeed);
        s.x += (s.targetX - s.x) * walkLerp;
        s.y += (s.targetY - s.y) * walkLerp;

        // After conversation ends, walk home
        if (s.convoAge > 3 && s.convoPartnerId) {
          s.targetX = s.homeX;
          s.targetY = s.homeY;
          s.isWalking = true;
        }

        // Walk phase — faster when moving
        const moving = Math.abs(s.targetX - s.x) > 0.001 || Math.abs(s.targetY - s.y) > 0.001;
        s.walkPhase += dt * (moving ? 8 : 1.2);

        // Blink
        s.blinkTimer -= dt;
        if (s.blinkTimer <= 0) {
          s.blinking = !s.blinking;
          s.blinkTimer = s.blinking ? 0.12 : 2.5 + Math.random() * 4;
        }

        // Look angle
        s.lookAngle += (s.lookTarget - s.lookAngle) * dt * 3;
        if (Math.abs(s.lookAngle - s.lookTarget) < 0.05 && !s.convoPartnerId) {
          s.lookTarget = (Math.random() - 0.5) * 0.5;
        }

        // Pulse
        if (s.pulseAge >= 0) s.pulseAge += dt;
        if (s.shiftAge >= 0) s.shiftAge += dt;
        if (s.colorFlashAge >= 0) s.colorFlashAge += dt;
        if (s.convoAge >= 0) s.convoAge += dt;

        // Bounce physics (spring)
        s.bounceVel += 120 * dt; // gravity
        s.bounceY += s.bounceVel * dt;
        if (s.bounceY > 0) {
          s.bounceY = 0;
          s.bounceVel = -s.bounceVel * 0.4;
          s.squash = 1.15; // squash on landing
          if (Math.abs(s.bounceVel) < 1) s.bounceVel = 0;
        }
        // Squash recovery
        s.squash += (1 - s.squash) * dt * 10;

        // Expression timeout
        if (s.shiftAge > 3 && s.expression !== "idle") s.expression = "idle";

        // Speech bubble
        if (s.speechBubble) {
          s.speechBubble.age += dt;
          if (s.speechBubble.age > 3) s.speechBubble = null;
        }
      }

      // --- Update particles ---
      const particles = particlesRef.current;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life += dt;
        if (p.life > p.maxLife) { particles.splice(i, 1); continue; }
        p.vy += 60 * dt; // gravity
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }

      // --- Draw edges ---
      for (const edge of edges) {
        const sa = states.get(edge.source);
        const sb = states.get(edge.target);
        if (!sa || !sb) continue;
        const ax = pad + sa.x * gw;
        const ay = pad + sa.y * gh + sa.bounceY;
        const bx = pad + sb.x * gw;
        const by = pad + sb.y * gh + sb.bounceY;

        const activeConvo = conversations.find(
          (c) => (c.from_id === edge.source && c.to_id === edge.target) ||
                 (c.from_id === edge.target && c.to_id === edge.source)
        );

        if (activeConvo && sa.convoAge < 4) {
          // Animated conversation edge
          drawConversationEdge(ctx, ax, ay, bx, by, sa.convoAge);
        } else {
          ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
          ctx.strokeStyle = "rgba(0,0,0,0.05)";
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
      }

      // --- Draw shockwave rings ---
      for (const agent of agents) {
        const s = states.get(agent.id);
        if (!s) continue;
        if (s.pulseAge < 0 || s.pulseAge > 2) continue;
        const baseX = pad + s.x * gw;
        const baseY = pad + s.y * gh + s.bounceY;

        // Multiple expanding rings
        const ringCount = Math.abs(s.shiftDelta) > 0.03 ? 3 : 2;
        for (let r = 0; r < ringCount; r++) {
          const delay = r * 0.2;
          const ringAge = s.pulseAge - delay;
          if (ringAge < 0 || ringAge > 1.5) continue;
          const radius = HEAD_R + ringAge * 35;
          const alpha = Math.max(0, 1 - ringAge / 1.5) * 0.3;
          ctx.beginPath();
          ctx.arc(baseX, baseY, radius, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(26,26,26,${alpha})`;
          ctx.lineWidth = 2 - ringAge;
          ctx.stroke();
        }
      }

      // --- Draw agents ---
      for (const agent of agents) {
        const s = states.get(agent.id);
        if (!s) continue;

        const baseX = pad + s.x * gw;
        const baseY = pad + s.y * gh + s.bounceY;
        const isSelected = agent.id === selectedAgentId;
        const isTarget = targetAgentIds.includes(agent.id);

        let drawX = baseX;
        // Thinking wobble
        if (s.expression === "thinking") drawX += Math.sin(s.walkPhase * 3) * 2;
        // Resistant shake (vigorous)
        if (s.expression === "resistant" && s.shiftAge >= 0 && s.shiftAge < 0.8) {
          drawX += Math.sin(s.shiftAge * 50) * 4 * (1 - s.shiftAge / 0.8);
        }

        drawStickFigure(
          ctx, drawX, baseY,
          s.color, s.prevColor, s.colorFlashAge,
          s.expression, s.blinking,
          s.lookAngle, s.walkPhase,
          isSelected, isTarget,
          s.shiftAge, s.shiftDelta,
          s.squash,
          agent.name,
        );

        // Speech bubble
        if (s.speechBubble) {
          const bubble = s.speechBubble;
          const fadeIn = Math.min(1, bubble.age / 0.3);
          const fadeOut = bubble.age > 2 ? Math.max(0, 1 - (bubble.age - 2) / 1) : 1;
          const alpha = fadeIn * fadeOut;
          if (alpha > 0) {
            ctx.font = "8px 'Courier New', monospace";
            const textW = ctx.measureText(bubble.text).width;
            const bw = Math.min(textW + 10, 120);
            const bh = 16;
            const bx = drawX - bw / 2;
            const by = baseY - HEAD_R * s.squash - 24 - bh;
            const popScale = Math.min(1, bubble.age / 0.15);

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.translate(drawX, by + bh);
            ctx.scale(popScale, popScale);
            ctx.translate(-drawX, -(by + bh));

            // Rounded rect bubble
            const radius = 4;
            ctx.beginPath();
            ctx.moveTo(bx + radius, by);
            ctx.lineTo(bx + bw - radius, by);
            ctx.arcTo(bx + bw, by, bx + bw, by + radius, radius);
            ctx.lineTo(bx + bw, by + bh - radius);
            ctx.arcTo(bx + bw, by + bh, bx + bw - radius, by + bh, radius);
            ctx.lineTo(bx + radius, by + bh);
            ctx.arcTo(bx, by + bh, bx, by + bh - radius, radius);
            ctx.lineTo(bx, by + radius);
            ctx.arcTo(bx, by, bx + radius, by, radius);
            ctx.closePath();
            ctx.fillStyle = "#ffffff";
            ctx.fill();
            ctx.strokeStyle = "#1a1a1a";
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Tail
            ctx.beginPath();
            ctx.moveTo(drawX - 4, by + bh);
            ctx.lineTo(drawX, by + bh + 6);
            ctx.lineTo(drawX + 4, by + bh);
            ctx.fillStyle = "#ffffff"; ctx.fill();
            ctx.strokeStyle = "#1a1a1a"; ctx.lineWidth = 1.5; ctx.stroke();
            ctx.fillStyle = "#ffffff"; ctx.fillRect(drawX - 4, by + bh - 1, 8, 2);

            ctx.fillStyle = "#1a1a1a";
            ctx.textAlign = "center";
            ctx.fillText(bubble.text, drawX, by + 11);
            ctx.restore();
          }
        }
      }

      // --- Draw particles ---
      for (const p of particles) {
        const agentId = (p as any)._agentId;
        const s = agentId ? states.get(agentId) : null;
        if (!s) continue;
        const ox = pad + s.x * gw;
        const oy = pad + s.y * gh;
        const alpha = Math.max(0, 1 - p.life / p.maxLife);
        ctx.fillStyle = `rgba(26,26,26,${alpha * 0.6})`;
        ctx.beginPath();
        ctx.arc(ox + p.x, oy + p.y, p.size * (1 - p.life / p.maxLife), 0, Math.PI * 2);
        ctx.fill();
      }

      animRef.current = requestAnimationFrame(draw);
    },
    [agents, edges, selectedAgentId, targetAgentIds, shifts, conversations],
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
