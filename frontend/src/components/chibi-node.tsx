"use client";

import { positionToColor, hairColor, outfitColor, irisColor, mouthPath, GENUINE, FONT_MONO, TEXT_SECONDARY } from "@/lib/colors";

interface ChibiNodeProps {
  x: number;
  y: number;
  agent: { position: number; name: string; [k: string]: unknown };
  isSelected?: boolean;
  isTarget?: boolean;
}

export function ChibiNode({ x, y, agent, isSelected, isTarget }: ChibiNodeProps) {
  const col    = positionToColor(agent.position);
  const hair   = hairColor(agent.name);
  const outfit = outfitColor(agent.name);
  const iris   = irisColor(agent.name);
  const p      = agent.position;

  return (
    <g transform={`translate(${x},${y})`} style={{ cursor: "pointer" }}>
      {isSelected && <ellipse rx={22} ry={30} fill="none" stroke={col} strokeWidth={2} strokeDasharray="4,3" opacity={0.8} />}
      {isTarget && <ellipse rx={26} ry={34} fill="none" stroke={GENUINE} strokeWidth={2.5} opacity={0.9} />}

      {/* Shadow */}
      <ellipse cx={0} cy={22} rx={12} ry={4} fill="rgba(0,0,0,0.07)" />

      {/* Body + arms */}
      <rect x={-10} y={11} width={20} height={12} rx={6} fill={outfit} stroke="rgba(0,0,0,0.1)" strokeWidth={1.2} />
      <ellipse cx={-14} cy={15} rx={5} ry={4} fill={outfit} stroke="rgba(0,0,0,0.1)" strokeWidth={1} />
      <ellipse cx={14} cy={15} rx={5} ry={4} fill={outfit} stroke="rgba(0,0,0,0.1)" strokeWidth={1} />

      {/* Hair back */}
      <ellipse cx={0} cy={-14} rx={15} ry={9} fill={hair} />

      {/* Head */}
      <ellipse cx={0} cy={-5} rx={15} ry={17} fill={col} stroke="rgba(0,0,0,0.1)" strokeWidth={1.5} />

      {/* Hair front */}
      <ellipse cx={0} cy={-20} rx={13} ry={6} fill={hair} />
      <ellipse cx={-11} cy={-17} rx={5} ry={7} fill={hair} />
      <ellipse cx={11} cy={-17} rx={5} ry={7} fill={hair} />

      {/* Blush */}
      <ellipse cx={-10} cy={-1} rx={4.5} ry={3} fill="rgba(255,120,120,0.22)" />
      <ellipse cx={10} cy={-1} rx={4.5} ry={3} fill="rgba(255,120,120,0.22)" />

      {/* Eyebrows — furrow when negative */}
      <path d={`M -10 ${-12 + (p < 0 ? -2 : 0)} Q -7 ${-14 + (p < 0 ? -2 : 0)} -4 ${-12 + (p < 0 ? -2 : 0)}`}
        stroke="rgba(0,0,0,0.6)" strokeWidth={1.5} fill="none" strokeLinecap="round" />
      <path d={`M 4 ${-12 + (p < 0 ? -2 : 0)} Q 7 ${-14 + (p < 0 ? -2 : 0)} 10 ${-12 + (p < 0 ? -2 : 0)}`}
        stroke="rgba(0,0,0,0.6)" strokeWidth={1.5} fill="none" strokeLinecap="round" />

      {/* Eyes */}
      <circle cx={-7} cy={-7} r={4} fill="white" />
      <circle cx={7} cy={-7} r={4} fill="white" />
      <circle cx={-7} cy={-7} r={2.8} fill={iris} />
      <circle cx={7} cy={-7} r={2.8} fill={iris} />
      <circle cx={-7} cy={-7} r={1.5} fill="rgba(0,0,0,0.8)" />
      <circle cx={7} cy={-7} r={1.5} fill="rgba(0,0,0,0.8)" />
      <circle cx={-5.8} cy={-8.2} r={1.2} fill="rgba(255,255,255,0.85)" />
      <circle cx={8.2} cy={-8.2} r={1.2} fill="rgba(255,255,255,0.85)" />

      {/* Nose */}
      <circle cx={0} cy={-3} r={1.2} fill="rgba(0,0,0,0.2)" />

      {/* Mouth — smile when for, frown when against */}
      <path d={mouthPath(p, 0, 1)} stroke="rgba(0,0,0,0.55)" strokeWidth={1.5} fill="none" strokeLinecap="round" />

      {/* Name label */}
      <text y={30} textAnchor="middle" fontSize={8} fontFamily={FONT_MONO}
        fill={TEXT_SECONDARY} fontWeight={500}>
        {agent.name.split(" ")[0]}
      </text>
    </g>
  );
}
