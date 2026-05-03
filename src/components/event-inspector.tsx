"use client";

import type { GraphSnapshot } from "@/lib/studio-graph";
import type { OrchestrationErrorCode, OrchestrationEvent } from "@/lib/types";

type EventInspectorProps = {
  snapshot: GraphSnapshot;
  events: OrchestrationEvent[];
  selectedNodeId: string;
  selectedTaskId?: string;
};

function formatEventHeading(event: OrchestrationEvent): string {
  switch (event.type) {
    case "run-start":
      return "Run started";
    case "node-status":
      return `${event.status}: ${event.title}`;
    case "dispatcher-plan":
      return "Dispatcher plan";
    case "task-assignment":
      return `Task assigned: ${event.task.title}`;
    case "node-chunk":
      return `${event.phase} chunk #${event.sequence}`;
    case "agent-result":
      return `Agent result: ${event.task.title}`;
    case "final-response":
      return "Final response";
    case "provider-warning":
      return "Provider warning";
    case "run-complete":
      return "Run complete";
    case "run-cancelled":
      return "Run cancelled";
    case "run-error":
      return "Run error";
  }
}

function eventSummary(event: OrchestrationEvent): string {
  switch (event.type) {
    case "run-start":
      return event.prompt;
    case "node-status":
      return event.detail;
    case "dispatcher-plan":
      return event.summary;
    case "task-assignment":
      return `${event.detail}\n\n${event.task.objective}`;
    case "node-chunk":
      return event.chunk;
    case "agent-result":
      return event.output;
    case "final-response":
      return event.response;
    case "provider-warning":
      return event.message;
    case "run-complete":
      return event.message;
    case "run-cancelled":
      return event.message;
    case "run-error":
      return event.message;
  }
}

function getEventErrorCode(
  event: OrchestrationEvent,
): OrchestrationErrorCode | undefined {
  if ("errorCode" in event) {
    return event.errorCode;
  }

  return undefined;
}

export function EventInspector({
  snapshot,
  events,
  selectedNodeId,
  selectedTaskId,
}: EventInspectorProps) {
  const selectedNode = snapshot.nodeSnapshots[selectedNodeId];
  const selectedTask = selectedTaskId
    ? snapshot.taskSnapshots[selectedTaskId]
    : undefined;
  const latestInput = selectedTask?.latestInput ?? selectedNode.latestInput;
  const latestOutput = selectedTask?.latestOutput ?? selectedNode.latestOutput;
  const hasRunEvents = events.length > 0;
  const relatedEvents = events.filter((event) => {
    if (selectedTask) {
      if (event.type === "dispatcher-plan") {
        return event.tasks.some((task) => task.id === selectedTask.id);
      }

      if (event.type === "task-assignment" || event.type === "agent-result") {
        return event.task.id === selectedTask.id;
      }

      if (event.type === "node-status" || event.type === "node-chunk") {
        return event.taskId === selectedTask.id;
      }

      if (event.type === "provider-warning" || event.type === "run-error") {
        return event.nodeId === selectedTask.agentId;
      }

      return false;
    }

    if (event.type === "run-start") {
      return selectedNodeId === "user" || selectedNodeId === "dispatcher";
    }

    if ("nodeId" in event) {
      return event.nodeId === selectedNodeId;
    }

    return false;
  });

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
        <p className="text-xs text-slate-400">
          Inspect the selected node or task and follow the run event trail in sync.
        </p>
      </div>

      {!hasRunEvents ? (
        <div className="border-b border-white/10 px-5 py-3 text-sm text-slate-400">
          No run data yet. Start a run or reopen history to inspect inputs, outputs, and
          event details.
        </div>
      ) : null}

      <div className="grid gap-4 p-5 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] 2xl:grid-cols-1">
        <div className="space-y-4">
          {selectedTask ? (
            <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-50">
                    {selectedTask.title}
                  </p>
                  <p className="text-xs text-slate-300">
                    {selectedTask.agentName} · task node
                  </p>
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
                    {selectedTask.dependsOn.length === 0
                      ? "None"
                      : selectedTask.dependsOn.join(", ")}
                  </dd>
                </div>
              </dl>
            </div>
          ) : null}

          <div className="rounded-2xl border border-white/10 bg-white/4 p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-50">
                  {selectedNode.label}
                </p>
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

        <div className="rounded-2xl border border-white/10 bg-white/4 p-4">
          <p className="mb-3 text-xs uppercase tracking-[0.2em] text-slate-500">
            Event trail
          </p>

          <div className="max-h-[500px] space-y-3 overflow-auto pr-1">
            {relatedEvents.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-slate-900/40 p-4 text-sm text-slate-400">
                No events yet for this selection.
              </div>
            ) : (
              [...relatedEvents].reverse().map((event) => (
                <article
                  key={event.eventId}
                  className="rounded-2xl border border-white/10 bg-slate-900/50 p-3"
                >
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-slate-100">
                        {formatEventHeading(event)}
                      </p>
                      {getEventErrorCode(event) ? (
                        <span className="rounded-full border border-rose-400/20 bg-rose-400/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-rose-200">
                          {getEventErrorCode(event)}
                        </span>
                      ) : null}
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-slate-400">
                        v{event.schemaVersion}
                      </span>
                    </div>
                    <time className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                      {new Date(event.timestamp).toLocaleTimeString()}
                    </time>
                  </div>
                  <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-xs text-slate-400">
                    {eventSummary(event)}
                  </pre>
                </article>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
