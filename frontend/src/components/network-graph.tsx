"use client";

import { useCallback, useRef, useEffect, useState } from "react";
import { useAgents, useEdges, useSimStore } from "@/lib/store";
import type { AgentData } from "@/lib/types";

// position [-1,1] -> color: red (against) -> gray (neutral) -> blue (for)
function positionToColor(position: number): string {
  if (position < 0) {
    const t = Math.abs(position);
    const r = Math.round(220 - t * 30);
    const g = Math.round(220 - t * 140);
    const b = Math.round(220 - t * 140);
    return `rgb(${r},${g},${b})`;
  } else {
    const t = position;
    const r = Math.round(220 - t * 140);
    const g = Math.round(220 - t * 140);
    const b = Math.round(220 - t * 30);
    return `rgb(${r},${g},${b})`;
  }
}

type GraphNode = {
  id: string;
  name: string;
  position: number;
  x?: number;
  y?: number;
  fx?: number;
  fy?: number;
};

type GraphLink = {
  source: string;
  target: string;
  weight: number;
};

export default function NetworkGraph() {
  const agents = useAgents();
  const edges = useEdges();
  const selectAgent = useSimStore((s) => s.selectAgent);
  const selectedAgentId = useSimStore((s) => s.selectedAgentId);
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<unknown>(null);
  const [ForceGraph, setForceGraph] = useState<React.ComponentType<Record<string, unknown>> | null>(null);

  useEffect(() => {
    import("react-force-graph-2d").then((mod) => {
      setForceGraph(() => mod.default);
    });
  }, []);

  const nodes: GraphNode[] = agents.map((a) => ({
    id: a.id,
    name: a.name,
    position: a.position,
  }));

  const links: GraphLink[] = edges.map((e) => ({
    source: e.source,
    target: e.target,
    weight: e.weight,
  }));

  const handleNodeClick = useCallback(
    (node: { id?: string | number }) => {
      selectAgent(node.id as string);
    },
    [selectAgent]
  );

  const nodeCanvasObject = useCallback(
    (node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const label = node.name.split(" ")[0];
      const fontSize = 12 / globalScale;
      const radius = 6;
      const isSelected = node.id === selectedAgentId;

      // Node circle
      ctx.beginPath();
      ctx.arc(node.x ?? 0, node.y ?? 0, radius, 0, 2 * Math.PI);
      ctx.fillStyle = positionToColor(node.position);
      ctx.fill();

      if (isSelected) {
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2 / globalScale;
        ctx.stroke();
      }

      // Label
      ctx.font = `${fontSize}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = "#e5e5e5";
      ctx.fillText(label, node.x ?? 0, (node.y ?? 0) + radius + 2);
    },
    [selectedAgentId]
  );

  if (!ForceGraph) {
    return (
      <div ref={containerRef} className="flex-1 flex items-center justify-center bg-neutral-950">
        <span className="text-neutral-500">Loading graph...</span>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 bg-neutral-950 relative">
      <ForceGraph
        ref={fgRef}
        graphData={{ nodes, links }}
        nodeId="id"
        nodeCanvasObject={nodeCanvasObject}
        nodePointerAreaPaint={(node: GraphNode, color: string, ctx: CanvasRenderingContext2D) => {
          ctx.beginPath();
          ctx.arc(node.x ?? 0, node.y ?? 0, 8, 0, 2 * Math.PI);
          ctx.fillStyle = color;
          ctx.fill();
        }}
        linkColor={() => "rgba(255,255,255,0.1)"}
        linkWidth={(link: GraphLink) => link.weight * 2}
        onNodeClick={handleNodeClick}
        backgroundColor="#0a0a0a"
        width={containerRef.current?.clientWidth ?? 800}
        height={containerRef.current?.clientHeight ?? 600}
        cooldownTicks={100}
      />
    </div>
  );
}
