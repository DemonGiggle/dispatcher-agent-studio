import type { SavedRunRecord } from "@/lib/studio-persistence";
import type {
  AgentResultEvent,
  DispatcherPlanEvent,
  FinalResponseEvent,
  OrchestrationEvent,
} from "@/lib/types";

export type RunArtifacts = {
  plan?: DispatcherPlanEvent;
  workerReports: AgentResultEvent[];
  finalResponse?: FinalResponseEvent;
  totalEvents: number;
};

export type ReplaySelection = {
  nodeId: string;
  taskId?: string;
};

export function extractRunArtifacts(events: OrchestrationEvent[]): RunArtifacts {
  let plan: DispatcherPlanEvent | undefined;
  let finalResponse: FinalResponseEvent | undefined;
  const workerReports: AgentResultEvent[] = [];

  for (const event of events) {
    if (event.type === "dispatcher-plan") {
      plan = event;
    }

    if (event.type === "agent-result") {
      workerReports.push(event);
    }

    if (event.type === "final-response") {
      finalResponse = event;
    }
  }

  return {
    plan,
    workerReports,
    finalResponse,
    totalEvents: events.length,
  };
}

export function createReplaySlice(
  events: OrchestrationEvent[],
  visibleEventCount: number,
): OrchestrationEvent[] {
  const clampedCount = Math.max(0, Math.min(visibleEventCount, events.length));
  return events.slice(0, clampedCount);
}

export function getReplaySelection(
  events: OrchestrationEvent[],
  fallbackNodeId = "dispatcher",
): ReplaySelection {
  const lastEvent = events.at(-1);

  if (!lastEvent) {
    return { nodeId: fallbackNodeId };
  }

  switch (lastEvent.type) {
    case "task-assignment":
      return { nodeId: lastEvent.nodeId, taskId: lastEvent.task.id };
    case "node-status":
    case "node-chunk":
      return { nodeId: lastEvent.nodeId, taskId: lastEvent.taskId };
    case "agent-result":
      return { nodeId: lastEvent.nodeId, taskId: lastEvent.task.id };
    case "dispatcher-plan":
    case "final-response":
    case "run-complete":
    case "run-cancelled":
      return { nodeId: "dispatcher" };
    case "provider-warning":
    case "run-error":
      return { nodeId: lastEvent.nodeId };
    case "run-start":
      return { nodeId: "dispatcher" };
  }
}

export function findRunRecord(
  recentRuns: SavedRunRecord[],
  runId?: string,
): SavedRunRecord | undefined {
  return runId ? recentRuns.find((run) => run.id === runId) : undefined;
}
