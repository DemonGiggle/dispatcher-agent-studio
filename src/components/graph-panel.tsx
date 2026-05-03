"use client";

import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  type ReactFlowInstance,
  type Edge,
} from "@xyflow/react";
import { Focus, ScanSearch } from "lucide-react";
import { useMemo, useState } from "react";

import { AgentNode, type AgentGraphNode } from "@/components/agent-node";
import { TaskNode, type TaskGraphNode } from "@/components/task-node";
import type { GraphSnapshot, TaskSnapshot } from "@/lib/studio-graph";

type GraphPanelProps = {
  snapshot: GraphSnapshot;
  selectedNodeId: string;
  selectedTaskId?: string;
  onSelectNode: (nodeId: string) => void;
  onSelectTask: (taskId: string) => void;
};

type FlowNode = AgentGraphNode | TaskGraphNode;

function buildGridPosition(
  index: number,
  columns: number,
  startX: number,
  startY: number,
  columnWidth: number,
  rowHeight: number,
) {
  const row = Math.floor(index / columns);
  const column = index % columns;

  return {
    x: startX + column * columnWidth,
    y: startY + row * rowHeight,
  };
}

function edgePalette(status: TaskSnapshot["status"]) {
  switch (status) {
    case "queued":
      return { stroke: "#f97316", label: "#fdba74", width: 1.7 };
    case "running":
      return { stroke: "#38bdf8", label: "#7dd3fc", width: 1.8 };
    case "completed":
      return { stroke: "#22c55e", label: "#86efac", width: 1.8 };
    case "error":
      return { stroke: "#ef4444", label: "#fca5a5", width: 1.8 };
    case "cancelled":
      return { stroke: "#94a3b8", label: "#cbd5e1", width: 1.6 };
    default:
      return { stroke: "#64748b", label: "#cbd5e1", width: 1.4 };
  }
}

export function GraphPanel({
  snapshot,
  selectedNodeId,
  selectedTaskId,
  onSelectNode,
  onSelectTask,
}: GraphPanelProps) {
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<FlowNode, Edge> | null>(
    null,
  );

  const taskSnapshots = useMemo(
    () =>
      snapshot.tasks
        .map((task) => snapshot.taskSnapshots[task.id])
        .filter((task): task is TaskSnapshot => Boolean(task)),
    [snapshot.taskSnapshots, snapshot.tasks],
  );

  const agentSnapshots = useMemo(
    () => Object.values(snapshot.nodeSnapshots).filter((node) => node.kind === "agent"),
    [snapshot.nodeSnapshots],
  );

  const taskColumns = Math.max(1, Math.min(4, Math.ceil(Math.sqrt(taskSnapshots.length || 1))));
  const taskRows = Math.max(1, Math.ceil(taskSnapshots.length / taskColumns));
  const agentColumns = Math.max(
    1,
    Math.min(4, Math.ceil(Math.sqrt(agentSnapshots.length || 1))),
  );
  const agentRows = Math.max(1, Math.ceil(agentSnapshots.length / agentColumns));
  const widestColumns = Math.max(2, taskColumns, agentColumns);
  const dispatcherX = 220 + (widestColumns - 1) * 155;
  const agentStartY = 390 + (taskRows - 1) * 170;
  const canvasHeight = 520 + Math.max(0, agentRows - 1) * 220 + Math.max(0, taskRows - 1) * 110;

  const flowNodes = useMemo<FlowNode[]>(() => {
    const taskNodes: TaskGraphNode[] = taskSnapshots.map((task, index) => ({
      id: task.id,
      type: "taskCard",
      position: buildGridPosition(index, taskColumns, 90, 210, 310, 170),
      data: {
        ...task,
        selected: selectedTaskId === task.id,
        onSelect: onSelectTask,
      },
    }));

    const agentNodes: AgentGraphNode[] = agentSnapshots.map((node, index) => ({
      id: node.id,
      type: "agentCard",
      position: buildGridPosition(index, agentColumns, 50, agentStartY, 320, 220),
      data: {
        ...node,
        selected: selectedNodeId === node.id,
        onSelect: onSelectNode,
      },
    }));

    const nodes: FlowNode[] = [
      {
        id: "user",
        type: "agentCard",
        position: { x: Math.max(20, dispatcherX - 330), y: 36 },
        data: {
          ...snapshot.nodeSnapshots.user,
          selected: selectedNodeId === "user",
          onSelect: onSelectNode,
        },
      },
      {
        id: "dispatcher",
        type: "agentCard",
        position: { x: dispatcherX, y: 36 },
        data: {
          ...snapshot.nodeSnapshots.dispatcher,
          selected: selectedNodeId === "dispatcher",
          onSelect: onSelectNode,
        },
      },
      ...taskNodes,
      ...agentNodes,
    ];

    return nodes;
  }, [
    agentColumns,
    agentSnapshots,
    agentStartY,
    dispatcherX,
    onSelectNode,
    onSelectTask,
    selectedNodeId,
    selectedTaskId,
    snapshot.nodeSnapshots,
    taskColumns,
    taskSnapshots,
  ]);

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
      const taskSnapshot = snapshot.taskSnapshots[task.id];
      const palette = edgePalette(taskSnapshot?.status ?? "idle");
      const isActive =
        taskSnapshot?.status === "queued" ||
        taskSnapshot?.status === "running" ||
        taskSnapshot?.status === "completed";

      edges.push(
        {
          id: `dispatcher-to-${task.id}`,
          source: "dispatcher",
          target: task.id,
          label: "assign",
          animated: isActive,
          markerEnd: { type: MarkerType.ArrowClosed },
          style: {
            stroke: palette.stroke,
            strokeWidth: palette.width,
          },
          labelStyle: { fill: palette.label, fontSize: 11 },
        },
        {
          id: `${task.id}-to-${task.agentId}`,
          source: task.id,
          target: task.agentId,
          label: taskSnapshot?.agentName ?? task.agentId,
          animated: isActive,
          markerEnd: { type: MarkerType.ArrowClosed },
          style: {
            stroke: taskSnapshot?.agentAccent ?? "#38bdf8",
            strokeWidth: 1.5,
          },
          labelStyle: { fill: "#cbd5e1", fontSize: 11 },
        },
        {
          id: `${task.id}-report`,
          source: task.agentId,
          target: "dispatcher",
          label: task.title,
          animated: taskSnapshot?.status === "completed",
          markerEnd: { type: MarkerType.ArrowClosed },
          style: {
            stroke: palette.stroke,
            strokeDasharray: "6 4",
            strokeWidth: 1.3,
          },
          labelStyle: { fill: palette.label, fontSize: 11 },
        },
      );

      for (const dependencyId of task.dependsOn) {
        edges.push({
          id: `${dependencyId}-to-${task.id}`,
          source: dependencyId,
          target: task.id,
          label: "depends on",
          animated: false,
          markerEnd: { type: MarkerType.ArrowClosed },
          style: {
            stroke: "rgba(148, 163, 184, 0.7)",
            strokeDasharray: "4 6",
            strokeWidth: 1.2,
          },
          labelStyle: { fill: "#94a3b8", fontSize: 10 },
        });
      }
    }

    return edges;
  }, [snapshot.taskSnapshots, snapshot.tasks]);

  const focusSelection = () => {
    if (!flowInstance) {
      return;
    }

    const targetId = selectedTaskId ?? selectedNodeId;
    const targetNode = flowNodes.find((node) => node.id === targetId);

    if (!targetNode) {
      return;
    }

    flowInstance.setCenter(targetNode.position.x + 120, targetNode.position.y + 80, {
      zoom: 0.92,
      duration: 280,
    });
  };

  return (
    <div className="overflow-hidden rounded-[28px] border border-white/10 bg-slate-950/70 shadow-2xl shadow-slate-950/30">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-50">Agent graph</h2>
          <p className="text-xs text-slate-400">
            Dispatcher, task, dependency, and report flow in one execution canvas.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => flowInstance?.fitView({ duration: 260, padding: 0.18 })}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-slate-200 transition-colors hover:bg-white/10"
          >
            <ScanSearch className="h-3.5 w-3.5" />
            Fit run
          </button>
          <button
            type="button"
            onClick={focusSelection}
            className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[11px] text-cyan-100 transition-colors hover:bg-cyan-400/15"
          >
            <Focus className="h-3.5 w-3.5" />
            Focus selection
          </button>
        </div>
      </div>

      <div style={{ height: `${canvasHeight}px` }}>
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          onInit={setFlowInstance}
          nodeTypes={{ agentCard: AgentNode, taskCard: TaskNode }}
          fitView
          proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={{ type: "smoothstep" }}
        >
          <Background gap={28} color="rgba(148, 163, 184, 0.12)" />
          <MiniMap
            nodeStrokeColor={(node) =>
              "agentAccent" in (node.data as FlowNode["data"])
                ? ((node.data as TaskGraphNode["data"]).agentAccent ?? "#38bdf8")
                : ((node.data as AgentGraphNode["data"]).accent ?? "#38bdf8")
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
