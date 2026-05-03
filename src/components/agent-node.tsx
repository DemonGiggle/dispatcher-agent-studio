"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

import type { NodeSnapshot } from "@/lib/studio-graph";

export type AgentGraphNodeData = NodeSnapshot & {
  selected: boolean;
  onSelect: (nodeId: string) => void;
};

export type AgentGraphNode = Node<AgentGraphNodeData, "agentCard">;

const statusPalette: Record<
  NodeSnapshot["status"],
  { border: string; chip: string; glow: string }
> = {
  idle: {
    border: "rgba(148, 163, 184, 0.42)",
    chip: "#475569",
    glow: "0 0 0 0 transparent",
  },
  planning: {
    border: "rgba(99, 102, 241, 0.95)",
    chip: "#4f46e5",
    glow: "0 0 0 1px rgba(99, 102, 241, 0.4), 0 14px 38px rgba(79, 70, 229, 0.26)",
  },
  queued: {
    border: "rgba(249, 115, 22, 0.95)",
    chip: "#ea580c",
    glow: "0 0 0 1px rgba(249, 115, 22, 0.25)",
  },
  running: {
    border: "rgba(14, 165, 233, 0.95)",
    chip: "#0284c7",
    glow: "0 0 0 1px rgba(14, 165, 233, 0.4), 0 16px 40px rgba(14, 165, 233, 0.22)",
  },
  synthesizing: {
    border: "rgba(168, 85, 247, 0.95)",
    chip: "#9333ea",
    glow: "0 0 0 1px rgba(168, 85, 247, 0.4), 0 16px 40px rgba(168, 85, 247, 0.22)",
  },
  completed: {
    border: "rgba(34, 197, 94, 0.95)",
    chip: "#16a34a",
    glow: "0 0 0 1px rgba(34, 197, 94, 0.3)",
  },
  cancelled: {
    border: "rgba(148, 163, 184, 0.92)",
    chip: "#64748b",
    glow: "0 0 0 1px rgba(148, 163, 184, 0.25)",
  },
  error: {
    border: "rgba(239, 68, 68, 0.95)",
    chip: "#dc2626",
    glow: "0 0 0 1px rgba(239, 68, 68, 0.3)",
  },
};

export function AgentNode({ id, data }: NodeProps<AgentGraphNode>) {
  const palette = statusPalette[data.status];

  return (
    <div className="min-w-[248px] max-w-[248px]">
      <Handle type="target" position={Position.Left} />
      <button
        type="button"
        onClick={() => data.onSelect(id)}
        className="w-full rounded-2xl border px-4 py-3 text-left transition-transform duration-150 hover:-translate-y-0.5"
        style={{
          borderColor: data.selected ? data.accent : palette.border,
          background:
            "linear-gradient(180deg, rgba(15, 23, 42, 0.96), rgba(15, 23, 42, 0.82))",
          boxShadow: data.selected
            ? `0 0 0 1px ${data.accent}, 0 18px 44px rgba(2, 6, 23, 0.5)`
            : palette.glow,
        }}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-50">{data.label}</p>
            <p className="text-xs text-slate-400">{data.subtitle}</p>
          </div>
          <span
            className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white"
            style={{ backgroundColor: palette.chip }}
          >
            {data.status}
          </span>
        </div>

        <div className="space-y-2 text-xs text-slate-300">
          <div className="rounded-xl border border-white/8 bg-white/4 p-2.5">
            <p className="mb-1 text-[10px] uppercase tracking-[0.2em] text-slate-500">
              Current work
            </p>
            <p className="font-medium text-slate-100">{data.currentTask}</p>
            <p className="mt-1 line-clamp-3 text-slate-400">{data.detail}</p>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-white/8 bg-white/4 px-2.5 py-2">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                Provider
              </p>
              <p className="font-medium text-slate-100">
                {data.provider} · {data.model}
              </p>
            </div>
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: data.accent }}
            />
          </div>

          {data.capabilities.length > 0 ? (
            <div className="rounded-xl border border-white/8 bg-white/4 p-2.5">
              <p className="mb-1 text-[10px] uppercase tracking-[0.2em] text-slate-500">
                Strengths
              </p>
              <div className="flex flex-wrap gap-1.5">
                {data.capabilities.slice(0, 4).map((capability) => (
                  <span
                    key={capability}
                    className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-0.5 text-[10px] text-cyan-100"
                  >
                    {capability}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {data.latestOutput ? (
            <div className="rounded-xl border border-white/8 bg-white/4 p-2.5">
              <p className="mb-1 text-[10px] uppercase tracking-[0.2em] text-slate-500">
                Latest output
              </p>
              <p className="line-clamp-4 text-slate-300">{data.latestOutput}</p>
            </div>
          ) : null}

          {data.errorCode ? (
            <div className="rounded-xl border border-rose-400/30 bg-rose-400/10 p-2.5 text-rose-100">
              <p className="mb-1 text-[10px] uppercase tracking-[0.2em] text-rose-200/80">
                Error code
              </p>
              <p className="font-medium">{data.errorCode}</p>
            </div>
          ) : null}

          {data.warnings.length > 0 ? (
            <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-2.5 text-amber-100">
              <p className="mb-1 text-[10px] uppercase tracking-[0.2em] text-amber-200/80">
                Warning
              </p>
              <p>{data.warnings[data.warnings.length - 1]}</p>
              {data.warningCodes.length > 0 ? (
                <p className="mt-2 font-medium">
                  {data.warningCodes[data.warningCodes.length - 1]}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </button>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
