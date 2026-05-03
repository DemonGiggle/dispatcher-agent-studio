"use client";

import type { GraphSnapshot } from "@/lib/studio-graph";
import type { OrchestrationEvent } from "@/lib/types";

type EventInspectorProps = {
  snapshot: GraphSnapshot;
  events: OrchestrationEvent[];
  selectedNodeId: string;
};

function formatEventHeading(event: OrchestrationEvent): string {
  switch (event.type) {
    case "run-start":
      return "Run started";
    case "node-status":
      return `${event.status}: ${event.title}`;
    case "dispatcher-plan":
      return "Dispatcher plan";
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

export function EventInspector({
  snapshot,
  events,
  selectedNodeId,
}: EventInspectorProps) {
  const selectedNode = snapshot.nodeSnapshots[selectedNodeId];
  const relatedEvents = events.filter((event) => {
    if (event.type === "run-start") {
      return selectedNodeId === "user" || selectedNodeId === "dispatcher";
    }

    if ("nodeId" in event) {
      return event.nodeId === selectedNodeId;
    }

    return false;
  });

  return (
    <div className="overflow-hidden rounded-[28px] border border-white/10 bg-slate-950/70 shadow-2xl shadow-slate-950/30">
      <div className="border-b border-white/10 px-5 py-4">
        <h2 className="text-sm font-semibold text-slate-50">Inspector</h2>
        <p className="text-xs text-slate-400">
          Inspect the selected node&apos;s current input, output, and event trail.
        </p>
      </div>

      <div className="grid gap-4 p-5 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <div className="space-y-4">
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
            </dl>
          </div>

          <div className="space-y-3">
            <div className="rounded-2xl border border-white/10 bg-white/4 p-4">
              <p className="mb-2 text-xs uppercase tracking-[0.2em] text-slate-500">
                Latest input
              </p>
              <pre className="max-h-56 overflow-auto whitespace-pre-wrap text-xs text-slate-300">
                {selectedNode.latestInput ?? "No input captured for this node yet."}
              </pre>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/4 p-4">
              <p className="mb-2 text-xs uppercase tracking-[0.2em] text-slate-500">
                Latest output
              </p>
              <pre className="max-h-56 overflow-auto whitespace-pre-wrap text-xs text-slate-300">
                {selectedNode.latestOutput ?? "No output captured for this node yet."}
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
                No events yet for this node.
              </div>
            ) : (
              [...relatedEvents].reverse().map((event) => (
                <article
                  key={event.eventId}
                  className="rounded-2xl border border-white/10 bg-slate-900/50 p-3"
                >
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-slate-100">
                      {formatEventHeading(event)}
                    </p>
                    <time className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                      {new Date(event.timestamp).toLocaleTimeString()}
                    </time>
                  </div>
                  <p className="line-clamp-6 text-xs text-slate-400">
                    {eventSummary(event)}
                  </p>
                </article>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
