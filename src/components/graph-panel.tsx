"use client";

import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  type ReactFlowInstance,
  type Edge,
  useNodesState,
} from "@xyflow/react";
import { Focus, ScanSearch } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AgentNode, type AgentGraphNode } from "@/components/agent-node";
import { TaskNode, type TaskGraphNode } from "@/components/task-node";
import { calculateGraphLayout } from "@/lib/graph-layout";
import type { GraphSnapshot, TaskSnapshot } from "@/lib/studio-graph";

type GraphPanelProps = {
  snapshot: GraphSnapshot;
  isActive: boolean;
  selectedNodeId: string;
  selectedTaskId?: string;
  onSelectNode: (nodeId: string) => void;
  onSelectTask: (taskId: string) => void;
};

type FlowNode = AgentGraphNode | TaskGraphNode;

const focusRingClass =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950";

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
  isActive,
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

  const layout = useMemo(
    () => calculateGraphLayout(taskSnapshots.length, agentSnapshots.length),
    [agentSnapshots.length, taskSnapshots.length],
  );
  const selectedNodeSnapshot = snapshot.nodeSnapshots[selectedNodeId];
  const selectedTaskSnapshot = selectedTaskId
    ? snapshot.taskSnapshots[selectedTaskId]
    : undefined;
  const hasRunContent =
    snapshot.tasks.length > 0 ||
    Object.values(snapshot.nodeSnapshots).some(
      (node) =>
        node.status !== "idle" ||
        Boolean(node.latestOutput) ||
        Boolean(node.errorCode) ||
        node.warningCodes.length > 0,
    );

  const layoutNodes = useMemo<FlowNode[]>(() => {
    const taskNodes: TaskGraphNode[] = taskSnapshots.map((task, index) => ({
      id: task.id,
      type: "taskCard",
      position: layout.taskPositions[index] ?? { x: 120, y: 220 },
      dragHandle: ".graph-node-drag-handle",
      data: {
        ...task,
        selected: selectedTaskId === task.id,
        onSelect: onSelectTask,
      },
    }));

    const agentNodes: AgentGraphNode[] = agentSnapshots.map((node, index) => ({
      id: node.id,
      type: "agentCard",
      position: layout.agentPositions[index] ?? { x: 80, y: 400 },
      dragHandle: ".graph-node-drag-handle",
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
        position: layout.userPosition,
        dragHandle: ".graph-node-drag-handle",
        data: {
          ...snapshot.nodeSnapshots.user,
          selected: selectedNodeId === "user",
          onSelect: onSelectNode,
        },
      },
      {
        id: "dispatcher",
        type: "agentCard",
        position: layout.dispatcherPosition,
        dragHandle: ".graph-node-drag-handle",
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
    agentSnapshots,
    layout.agentPositions,
    layout.dispatcherPosition,
    layout.taskPositions,
    layout.userPosition,
    onSelectNode,
    onSelectTask,
    selectedNodeId,
    selectedTaskId,
    snapshot.nodeSnapshots,
    taskSnapshots,
  ]);

  const [flowNodes, setFlowNodes, onFlowNodesChange] = useNodesState<FlowNode>(layoutNodes);

  useEffect(() => {
    setFlowNodes((currentNodes) => {
      const currentNodeById = new Map(currentNodes.map((node) => [node.id, node] as const));

      return layoutNodes.map((node) => {
        const existingNode = currentNodeById.get(node.id);

        return existingNode
          ? {
              ...node,
              position: existingNode.position,
            }
          : node;
      });
    });
  }, [layoutNodes, setFlowNodes]);

  const layoutSignature = useMemo(
    () => layoutNodes.map((node) => node.id).join("|"),
    [layoutNodes],
  );

  useEffect(() => {
    if (!isActive || !flowInstance || flowNodes.length === 0) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void flowInstance.fitView({ duration: 260, padding: 0.18 });
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [flowInstance, flowNodes.length, isActive, layoutSignature]);

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
    <section
      id="graph-panel"
      aria-labelledby="graph-panel-heading"
      tabIndex={-1}
      className="overflow-hidden rounded-[28px] border border-white/10 bg-slate-950/70 shadow-2xl shadow-slate-950/30 scroll-mt-4"
    >
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <div>
          <h2 id="graph-panel-heading" className="text-sm font-semibold text-slate-50">
            Agent graph
          </h2>
          <p className="text-xs text-slate-400">
            Dispatcher, task, dependency, and report flow in one execution canvas.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => flowInstance?.fitView({ duration: 260, padding: 0.18 })}
            className={`inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-slate-200 transition-colors hover:bg-white/10 ${focusRingClass}`}
          >
            <ScanSearch className="h-3.5 w-3.5" />
            Fit run
          </button>
          <button
            type="button"
            onClick={focusSelection}
            className={`inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[11px] text-cyan-100 transition-colors hover:bg-cyan-400/15 ${focusRingClass}`}
          >
            <Focus className="h-3.5 w-3.5" />
            Focus selection
          </button>
        </div>
      </div>

      <div className="border-b border-white/10 px-5 py-3 text-sm text-slate-300">
        {hasRunContent
          ? "Use the graph to inspect orchestration state visually, then drag cards by the handle to refine the layout when needed."
          : "Run or reopen a conversation to populate task routing, execution status, and worker reports."}
      </div>

      <div style={{ height: `${layout.canvasHeight}px` }} aria-label="Orchestration graph canvas">
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          onNodesChange={onFlowNodesChange}
          onInit={setFlowInstance}
          nodeTypes={{ agentCard: AgentNode, taskCard: TaskNode }}
          nodesDraggable
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

      <div className="border-t border-white/10 p-4">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] 2xl:grid-cols-1">
          <div className="rounded-2xl border border-white/10 bg-white/4 p-4">
            <p className="mb-2 text-xs uppercase tracking-[0.2em] text-slate-500">
              Selection summary
            </p>
            {selectedTaskSnapshot ? (
              <div className="space-y-2 text-sm text-slate-200">
                <p className="font-medium text-slate-100">{selectedTaskSnapshot.title}</p>
                <p>{selectedTaskSnapshot.detail}</p>
                <p className="text-xs text-slate-400">
                  {selectedTaskSnapshot.agentName} · {selectedTaskSnapshot.status}
                </p>
              </div>
            ) : (
              <div className="space-y-2 text-sm text-slate-200">
                <p className="font-medium text-slate-100">{selectedNodeSnapshot.label}</p>
                <p>{selectedNodeSnapshot.detail}</p>
                <p className="text-xs text-slate-400">
                  {selectedNodeSnapshot.provider} · {selectedNodeSnapshot.model} ·{" "}
                  {selectedNodeSnapshot.status}
                </p>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/4 p-4">
            <p className="mb-2 text-xs uppercase tracking-[0.2em] text-slate-500">
              Run outline
            </p>
            {taskSnapshots.length === 0 ? (
              <p className="text-sm text-slate-400">
                No tasks yet. The dispatcher will create a task graph after the next run
                starts.
              </p>
            ) : (
              <ul className="space-y-2 text-sm text-slate-200">
                {taskSnapshots.map((task) => (
                  <li
                    key={task.id}
                    className="rounded-xl border border-white/10 bg-slate-900/50 p-3"
                  >
                    <p className="font-medium text-slate-100">{task.title}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {task.agentName} · {task.status}
                      {task.dependsOn.length > 0
                        ? ` · depends on ${task.dependsOn.join(", ")}`
                        : " · no dependencies"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
