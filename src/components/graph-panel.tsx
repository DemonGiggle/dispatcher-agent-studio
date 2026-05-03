"use client";

import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  type Edge,
} from "@xyflow/react";
import { useMemo } from "react";

import { AgentNode, type AgentGraphNode } from "@/components/agent-node";
import type { GraphSnapshot } from "@/lib/studio-graph";

type GraphPanelProps = {
  snapshot: GraphSnapshot;
  selectedNodeId: string;
  onSelectNode: (nodeId: string) => void;
};

function buildAgentPosition(index: number) {
  const columns = 2;
  const row = Math.floor(index / columns);
  const column = index % columns;

  return {
    x: 220 + column * 320,
    y: 260 + row * 220,
  };
}

export function GraphPanel({
  snapshot,
  selectedNodeId,
  onSelectNode,
}: GraphPanelProps) {
  const flowNodes = useMemo<AgentGraphNode[]>(() => {
    const agentSnapshots = Object.values(snapshot.nodeSnapshots).filter(
      (node) => node.kind === "agent",
    );

    const agentNodes: AgentGraphNode[] = agentSnapshots.map((node, index) => ({
      id: node.id,
      type: "agentCard" as const,
      position: buildAgentPosition(index),
      data: {
        ...node,
        selected: selectedNodeId === node.id,
        onSelect: onSelectNode,
      },
    }));

    const nodes: AgentGraphNode[] = [
      {
        id: "user",
        type: "agentCard",
        position: { x: 20, y: 40 },
        data: {
          ...snapshot.nodeSnapshots.user,
          selected: selectedNodeId === "user",
          onSelect: onSelectNode,
        },
      },
      {
        id: "dispatcher",
        type: "agentCard",
        position: { x: 380, y: 40 },
        data: {
          ...snapshot.nodeSnapshots.dispatcher,
          selected: selectedNodeId === "dispatcher",
          onSelect: onSelectNode,
        },
      },
      ...agentNodes,
    ];

    return nodes;
  }, [onSelectNode, selectedNodeId, snapshot.nodeSnapshots]);

  const flowEdges = useMemo<Edge[]>(() => {
    const edges: Edge[] = [
      {
        id: "user-to-dispatcher",
        source: "user",
        target: "dispatcher",
        label: "prompt",
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: "#22c55e", strokeWidth: 1.5 },
        labelStyle: { fill: "#a7f3d0", fontSize: 12 },
      },
    ];

      for (const task of snapshot.tasks) {
        const agentSnapshot = snapshot.nodeSnapshots[task.agentId];
        const isActive =
          agentSnapshot?.status === "queued" ||
          agentSnapshot?.status === "running" ||
          agentSnapshot?.status === "completed";

      edges.push(
        {
          id: `dispatcher-to-${task.agentId}`,
          source: "dispatcher",
          target: task.agentId,
          label: task.title,
          animated: isActive,
          markerEnd: { type: MarkerType.ArrowClosed },
          style: {
            stroke: agentSnapshot?.accent ?? "#38bdf8",
            strokeWidth: 1.6,
          },
          labelStyle: { fill: "#cbd5e1", fontSize: 11 },
        },
        {
          id: `${task.agentId}-to-dispatcher`,
          source: task.agentId,
          target: "dispatcher",
          label: "report",
          animated: agentSnapshot?.status === "completed",
          markerEnd: { type: MarkerType.ArrowClosed },
          style: {
            stroke: "#94a3b8",
            strokeDasharray: "6 4",
            strokeWidth: 1.3,
          },
          labelStyle: { fill: "#94a3b8", fontSize: 11 },
        },
      );
    }

    return edges;
  }, [snapshot.nodeSnapshots, snapshot.tasks]);

  return (
    <div className="overflow-hidden rounded-[28px] border border-white/10 bg-slate-950/70 shadow-2xl shadow-slate-950/30">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-50">Agent graph</h2>
          <p className="text-xs text-slate-400">
            Live topology of dispatcher, specialists, and report flow.
          </p>
        </div>
        <div className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[11px] text-cyan-100">
          {snapshot.tasks.length} routed task{snapshot.tasks.length === 1 ? "" : "s"}
        </div>
      </div>

      <div className="h-[520px]">
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={{ agentCard: AgentNode }}
          fitView
          proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={{ type: "smoothstep" }}
        >
          <Background gap={28} color="rgba(148, 163, 184, 0.12)" />
          <MiniMap
            nodeStrokeColor={(node) =>
              (node.data as AgentGraphNode["data"]).accent ?? "#38bdf8"
            }
            nodeColor={() => "#0f172a"}
            maskColor="rgba(2, 6, 23, 0.55)"
          />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  );
}
