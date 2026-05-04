"use client";

import type { GraphSnapshot } from "@/lib/studio-graph";

type EventInspectorProps = {
  snapshot: GraphSnapshot;
  selectedNodeId: string;
  selectedTaskId?: string;
};

export function EventInspector({
  snapshot,
  selectedNodeId,
  selectedTaskId,
}: EventInspectorProps) {
  const selectedNode = snapshot.nodeSnapshots[selectedNodeId];
  const selectedTask = selectedTaskId
    ? snapshot.taskSnapshots[selectedTaskId]
    : undefined;
  const latestInput = selectedTask?.latestInput ?? selectedNode.latestInput;
  const latestOutput = selectedTask?.latestOutput ?? selectedNode.latestOutput;
  const hasCapturedOutput = latestInput !== undefined || latestOutput !== undefined;

  return (
    <section
      id="inspector-panel"
      aria-labelledby="inspector-panel-heading"
      tabIndex={-1}
      className="overflow-hidden rounded-[28px] border border-white/10 bg-slate-950/70 shadow-2xl shadow-slate-950/30 scroll-mt-4"
    >
      <div className="border-b border-white/10 px-5 py-4">
        <h2 id="inspector-panel-heading" className="text-sm font-semibold text-slate-50">
          Inspector
        </h2>
        <p className="text-xs text-slate-400">Inspect the selected node or task in context.</p>
      </div>

      {!hasCapturedOutput ? (
        <div className="border-b border-white/10 px-5 py-3 text-sm text-slate-400">
          No run data yet. Start a run or reopen history to inspect captured inputs and
          outputs.
        </div>
      ) : null}

      <div className="space-y-4 p-5">
        {selectedTask ? (
          <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-50">
                  {selectedTask.title}
                </p>
                <p className="text-xs text-slate-300">{selectedTask.agentName} · task node</p>
              </div>
              <span className="rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-100">
                {selectedTask.status}
              </span>
            </div>

            <dl className="space-y-3 text-xs">
              <div>
                <dt className="mb-1 text-cyan-100/70">Objective</dt>
                <dd className="text-slate-100">{selectedTask.objective}</dd>
              </div>
              <div>
                <dt className="mb-1 text-cyan-100/70">Expected output</dt>
                <dd className="text-slate-100">{selectedTask.expectedOutput}</dd>
              </div>
              <div>
                <dt className="mb-1 text-cyan-100/70">Dependencies</dt>
                <dd className="text-slate-100">
                  {selectedTask.dependsOn.length === 0 ? "None" : selectedTask.dependsOn.join(", ")}
                </dd>
              </div>
            </dl>
          </div>
        ) : null}

        <div className="rounded-2xl border border-white/10 bg-white/4 p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-50">{selectedNode.label}</p>
              <p className="text-xs text-slate-400">{selectedNode.subtitle}</p>
            </div>
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-200">
              {selectedNode.status}
            </span>
          </div>

          <dl className="space-y-3 text-xs">
            <div>
              <dt className="mb-1 text-slate-500">Current work</dt>
              <dd className="text-slate-200">{selectedNode.currentTask}</dd>
            </div>
            <div>
              <dt className="mb-1 text-slate-500">Detail</dt>
              <dd className="text-slate-300">{selectedNode.detail}</dd>
            </div>
            <div>
              <dt className="mb-1 text-slate-500">Provider</dt>
              <dd className="text-slate-300">
                {selectedNode.provider} · {selectedNode.model}
              </dd>
            </div>
            {selectedNode.capabilities.length > 0 ? (
              <div>
                <dt className="mb-1 text-slate-500">Strengths</dt>
                <dd className="flex flex-wrap gap-2 text-slate-300">
                  {selectedNode.capabilities.map((capability) => (
                    <span
                      key={capability}
                      className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-0.5 text-[10px] text-cyan-100"
                    >
                      {capability}
                    </span>
                  ))}
                </dd>
              </div>
            ) : null}
            {selectedNode.errorCode ? (
              <div>
                <dt className="mb-1 text-slate-500">Error code</dt>
                <dd className="text-rose-200">{selectedNode.errorCode}</dd>
              </div>
            ) : null}
            {selectedNode.warningCodes.length > 0 ? (
              <div>
                <dt className="mb-1 text-slate-500">Warning codes</dt>
                <dd className="text-amber-200">
                  {selectedNode.warningCodes.join(", ")}
                </dd>
              </div>
            ) : null}
          </dl>
        </div>

        <div className="space-y-3">
          <div className="rounded-2xl border border-white/10 bg-white/4 p-4">
            <p className="mb-2 text-xs uppercase tracking-[0.2em] text-slate-500">
              Latest input
            </p>
            <pre className="max-h-56 overflow-auto whitespace-pre-wrap text-xs text-slate-300">
              {latestInput ?? "No input captured for this selection yet."}
            </pre>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/4 p-4">
            <p className="mb-2 text-xs uppercase tracking-[0.2em] text-slate-500">
              Latest output
            </p>
            <pre className="max-h-56 overflow-auto whitespace-pre-wrap text-xs text-slate-300">
              {latestOutput ?? "No output captured for this selection yet."}
            </pre>
          </div>
        </div>
      </div>
    </section>
  );
}
