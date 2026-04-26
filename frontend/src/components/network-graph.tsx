"use client";

import { useRef, useEffect, useState, useMemo } from "react";
import { useSimStore, useCurrentAgents, useCurrentSnapshot } from "@/lib/store";
import { BG_CANVAS, BORDER, FONT_MONO, TEXT_MUTED, GENUINE, AGAINST } from "@/lib/colors";
import { ChibiNode } from "@/components/chibi-node";
import type { AgentData, EdgeData } from "@/lib/types";

// Simple force-directed layout — runs once to space out overlapping nodes
function forceLayout(
  agents: AgentData[],
  edges: EdgeData[],
  iterations: number = 120,
): Map<string, { x: number; y: number }> {
  // Initialize positions from agent data
  const pos = new Map<string, { x: number; y: number }>();
  for (const a of agents) {
    pos.set(a.id, { x: a.x, y: a.y });
  }

  if (agents.length === 0) return pos;

  // Build adjacency for spring forces
  const adj = new Map<string, Set<string>>();
  for (const a of agents) adj.set(a.id, new Set());
  for (const e of edges) {
    adj.get(e.source)?.add(e.target);
    adj.get(e.target)?.add(e.source);
  }

  const ids = agents.map((a) => a.id);
  const n = ids.length;

  for (let iter = 0; iter < iterations; iter++) {
    const t = 1 - iter / iterations; // cooling factor
    const repulse = 0.004 * t;
    const attract = 0.08 * t;
    const centerPull = 0.002 * t;

    const dx = new Map<string, number>();
    const dy = new Map<string, number>();
    for (const id of ids) { dx.set(id, 0); dy.set(id, 0); }

    // Repulsion between all pairs
    for (let i = 0; i < n; i++) {
      const pi = pos.get(ids[i])!;
      for (let j = i + 1; j < n; j++) {
        const pj = pos.get(ids[j])!;
        let ddx = pi.x - pj.x;
        let ddy = pi.y - pj.y;
        const dist = Math.sqrt(ddx * ddx + ddy * ddy) + 0.001;
        const force = repulse / (dist * dist);
        const fx = (ddx / dist) * force;
        const fy = (ddy / dist) * force;
        dx.set(ids[i], dx.get(ids[i])! + fx);
        dy.set(ids[i], dy.get(ids[i])! + fy);
        dx.set(ids[j], dx.get(ids[j])! - fx);
        dy.set(ids[j], dy.get(ids[j])! - fy);
      }
    }

    // Attraction along edges (spring)
    for (const e of edges) {
      const pa = pos.get(e.source);
      const pb = pos.get(e.target);
      if (!pa || !pb) continue;
      const ddx = pb.x - pa.x;
      const ddy = pb.y - pa.y;
      const dist = Math.sqrt(ddx * ddx + ddy * ddy) + 0.001;
      // Target length ~0.15 in normalized space
      const displacement = dist - 0.15;
      const force = displacement * attract;
      const fx = (ddx / dist) * force;
      const fy = (ddy / dist) * force;
      dx.set(e.source, dx.get(e.source)! + fx);
      dy.set(e.source, dy.get(e.source)! + fy);
      dx.set(e.target, dx.get(e.target)! - fx);
      dy.set(e.target, dy.get(e.target)! - fy);
    }

    // Gentle pull toward center to prevent drift
    for (const id of ids) {
      const p = pos.get(id)!;
      dx.set(id, dx.get(id)! + (0.5 - p.x) * centerPull);
      dy.set(id, dy.get(id)! + (0.5 - p.y) * centerPull);
    }

    // Apply forces with clamping
    const maxStep = 0.03 * t + 0.002;
    for (const id of ids) {
      const p = pos.get(id)!;
      let fdx = dx.get(id)!;
      let fdy = dy.get(id)!;
      const mag = Math.sqrt(fdx * fdx + fdy * fdy);
      if (mag > maxStep) {
        fdx = (fdx / mag) * maxStep;
        fdy = (fdy / mag) * maxStep;
      }
      pos.set(id, {
        x: Math.max(0.04, Math.min(0.96, p.x + fdx)),
        y: Math.max(0.04, Math.min(0.96, p.y + fdy)),
      });
    }
  }

  return pos;
}

export default function NetworkGraph() {
  const agents = useCurrentAgents();
  const edges = useSimStore((s) => s.edges);
  const selectAgent = useSimStore((s) => s.selectAgent);
  const selectedAgentId = useSimStore((s) => s.selectedAgentId);
  const targetAgentIds = useSimStore((s) => s.targetAgentIds);
  const snapshot = useCurrentSnapshot();
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });

  const conversations = snapshot?.conversations ?? [];
  const shifts = snapshot?.shifts ?? [];

  // Run force layout once when agents first load (use tick-0 agents as stable input)
  const tick0Agents = useSimStore((s) => s.ticks[0]?.agents ?? []);
  const tick0Edges = useSimStore((s) => s.ticks[0] ? s.edges : []);

  const layoutPositions = useMemo(() => {
    if (tick0Agents.length === 0) return new Map<string, { x: number; y: number }>();
    return forceLayout(tick0Agents, tick0Edges);
  }, [tick0Agents, tick0Edges]);

  // Track container size
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

  const pad = 60;
  const gw = size.w - pad * 2;
  const gh = size.h - pad * 2;
  const ax = (a: { id: string; x: number }) => {
    const lp = layoutPositions.get(a.id);
    return pad + (lp ? lp.x : a.x) * gw;
  };
  const ay = (a: { id: string; y: number }) => {
    const lp = layoutPositions.get(a.id);
    return pad + (lp ? lp.y : a.y) * gh;
  };

  // Active conversation pairs for edge highlighting
  const activePairs = new Set<string>();
  for (const c of conversations) {
    activePairs.add(`${c.from_id}:${c.to_id}`);
    activePairs.add(`${c.to_id}:${c.from_id}`);
  }

  function handleClick(e: React.MouseEvent<SVGSVGElement>) {
    const target = e.target as SVGElement;
    if (target.tagName === "svg" || target.tagName === "rect") {
      selectAgent(null);
    }
  }

  return (
    <div ref={containerRef} className="flex-1 relative" style={{ background: BG_CANVAS }}>
      <svg
        width={size.w}
        height={size.h}
        style={{ display: "block" }}
        onClick={handleClick}
      >
        <rect width={size.w} height={size.h} fill={BG_CANVAS} />

        {/* Edges */}
        {edges.map((edge) => {
          const a = agents.find((x) => x.id === edge.source);
          const b = agents.find((x) => x.id === edge.target);
          if (!a || !b) return null;
          const isActive = activePairs.has(`${edge.source}:${edge.target}`);
          return (
            <line
              key={`${edge.source}-${edge.target}`}
              x1={ax(a)} y1={ay(a)}
              x2={ax(b)} y2={ay(b)}
              stroke={isActive ? "rgba(0,0,0,0.25)" : "rgba(0,0,0,0.07)"}
              strokeWidth={isActive ? 1.8 : 0.6}
            />
          );
        })}

        {/* Shift indicators (floating deltas) */}
        {shifts.map((s, i) => {
          const agent = agents.find((a) => a.id === s.agent_id);
          if (!agent || Math.abs(s.delta) < 0.001) return null;
          const sign = s.delta > 0 ? "+" : "";
          return (
            <text
              key={`shift-${s.agent_id}-${i}`}
              x={ax(agent)}
              y={ay(agent) - 38}
              textAnchor="middle"
              fontSize={9}
              fontFamily={FONT_MONO}
              fontWeight={600}
              fill={s.delta > 0 ? GENUINE : AGAINST}
            >
              {sign}{s.delta.toFixed(3)}
            </text>
          );
        })}

        {/* Agent chibi nodes */}
        {agents.map((agent) => (
          <g key={agent.id} onClick={(e) => { e.stopPropagation(); selectAgent(agent.id); }}>
            <ChibiNode
              x={ax(agent)}
              y={ay(agent)}
              agent={agent}
              isSelected={agent.id === selectedAgentId}
              isTarget={targetAgentIds.includes(agent.id)}
            />
          </g>
        ))}
      </svg>
    </div>
  );
}
