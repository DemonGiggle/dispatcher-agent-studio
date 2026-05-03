"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

import type { TaskSnapshot } from "@/lib/studio-graph";

export type TaskGraphNodeData = TaskSnapshot & {
  selected: boolean;
  onSelect: (taskId: string) => void;
};

export type TaskGraphNode = Node<TaskGraphNodeData, "taskCard">;

const statusPalette: Record<
  TaskSnapshot["status"],
  { border: string; chip: string; glow: string }
> = {
  idle: {
    border: "rgba(148, 163, 184, 0.3)",
    chip: "#475569",
    glow: "0 0 0 0 transparent",
  },
  planning: {
    border: "rgba(99, 102, 241, 0.72)",
    chip: "#4f46e5",
    glow: "0 0 0 1px rgba(99, 102, 241, 0.25)",
  },
  queued: {
    border: "rgba(249, 115, 22, 0.85)",
    chip: "#ea580c",
    glow: "0 0 0 1px rgba(249, 115, 22, 0.2)",
  },
  running: {
    border: "rgba(14, 165, 233, 0.9)",
    chip: "#0284c7",
    glow: "0 0 0 1px rgba(14, 165, 233, 0.3), 0 12px 30px rgba(14, 165, 233, 0.18)",
  },
  synthesizing: {
    border: "rgba(168, 85, 247, 0.8)",
    chip: "#9333ea",
    glow: "0 0 0 1px rgba(168, 85, 247, 0.25)",
  },
  completed: {
    border: "rgba(34, 197, 94, 0.85)",
    chip: "#16a34a",
    glow: "0 0 0 1px rgba(34, 197, 94, 0.2)",
  },
  cancelled: {
    border: "rgba(148, 163, 184, 0.72)",
    chip: "#64748b",
    glow: "0 0 0 1px rgba(148, 163, 184, 0.2)",
  },
  error: {
    border: "rgba(239, 68, 68, 0.9)",
    chip: "#dc2626",
    glow: "0 0 0 1px rgba(239, 68, 68, 0.25), 0 12px 30px rgba(239, 68, 68, 0.15)",
  },
};

export function TaskNode({ id, data }: NodeProps<TaskGraphNode>) {
  const palette = statusPalette[data.status];

  return (
    <div className="min-w-[220px] max-w-[220px]">
      <Handle type="target" position={Position.Top} />
      <div className="mb-2 flex justify-end">
        <div
          data-testid={`graph-node-drag-${id}`}
          className="graph-node-drag-handle inline-flex cursor-grab rounded-full border border-white/10 bg-slate-950/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-300 active:cursor-grabbing"
          title="Drag to reposition this node"
        >
          Drag
        </div>
      </div>
      <button
        type="button"
        onClick={() => data.onSelect(id)}
        data-testid={`graph-node-${id}`}
        aria-pressed={data.selected}
        aria-label={`${data.title}, ${data.agentName}, ${data.status}`}
        className="w-full rounded-2xl border px-4 py-3 text-left transition-transform duration-150 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 motion-reduce:transform-none motion-reduce:transition-none"
        style={{
          borderColor: data.selected ? data.agentAccent : palette.border,
          background:
            "linear-gradient(180deg, rgba(15, 23, 42, 0.96), rgba(15, 23, 42, 0.84))",
          boxShadow: data.selected
            ? `0 0 0 1px ${data.agentAccent}, 0 18px 40px rgba(2, 6, 23, 0.45)`
            : palette.glow,
        }}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-50">{data.title}</p>
            <p className="text-xs text-slate-400">{data.agentName}</p>
          </div>
          <span
            className="rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white"
            style={{ backgroundColor: palette.chip }}
          >
            {data.status}
          </span>
        </div>

        <div className="space-y-2 text-xs text-slate-300">
          <div className="rounded-xl border border-white/8 bg-white/4 p-2.5">
            <p className="mb-1 text-[10px] uppercase tracking-[0.2em] text-slate-500">
              Objective
            </p>
            <p className="line-clamp-4">{data.objective}</p>
          </div>

          <div className="rounded-xl border border-white/8 bg-white/4 p-2.5">
            <p className="mb-1 text-[10px] uppercase tracking-[0.2em] text-slate-500">
              Current state
            </p>
            <p className="line-clamp-3">{data.detail}</p>
          </div>

          <div className="rounded-xl border border-white/8 bg-white/4 p-2.5">
            <p className="mb-1 text-[10px] uppercase tracking-[0.2em] text-slate-500">
              Dependencies
            </p>
            <p>{data.dependsOn.length === 0 ? "None" : data.dependsOn.join(", ")}</p>
          </div>

          {data.latestOutput ? (
            <div className="rounded-xl border border-white/8 bg-white/4 p-2.5">
              <p className="mb-1 text-[10px] uppercase tracking-[0.2em] text-slate-500">
                Latest output
              </p>
              <p className="line-clamp-4">{data.latestOutput}</p>
            </div>
          ) : null}
        </div>
      </button>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
