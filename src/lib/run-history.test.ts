import { describe, expect, it } from "vitest";

import { createReplaySlice, extractRunArtifacts, getReplaySelection } from "@/lib/run-history";
import type { OrchestrationEvent, ProviderExecutionMeta } from "@/lib/types";

const providerMeta: ProviderExecutionMeta = {
  requestedProvider: "mock",
  requestedModel: "demo-specialist",
  effectiveProvider: "mock",
  effectiveModel: "demo-specialist",
  mode: "mock",
};

const baseEvent = {
  schemaVersion: 2 as const,
  runId: "run-1",
  timestamp: "2026-05-03T00:00:00.000Z",
};

const events: OrchestrationEvent[] = [
  {
    ...baseEvent,
    eventId: "evt-1",
    type: "dispatcher-plan",
    nodeId: "dispatcher",
    summary: "Plan summary",
    tasks: [
      {
        id: "task-1",
        agentId: "agent-1",
        title: "Task 1",
        objective: "Objective",
        expectedOutput: "Output",
        dependsOn: [],
      },
    ],
    synthesisFocus: ["Focus"],
    input: "Planning input",
    output: "Planning output",
    provider: providerMeta,
  },
  {
    ...baseEvent,
    eventId: "evt-2",
    type: "agent-result",
    nodeId: "agent-1",
    task: {
      id: "task-1",
      agentId: "agent-1",
      title: "Task 1",
      objective: "Objective",
      expectedOutput: "Output",
      dependsOn: [],
    },
    attempt: 1,
    input: "Agent input",
    output: "Agent output",
    provider: providerMeta,
  },
  {
    ...baseEvent,
    eventId: "evt-3",
    type: "final-response",
    nodeId: "dispatcher",
    response: "Final response",
    input: "Synthesis input",
    output: "Final response",
    provider: providerMeta,
  },
];

describe("run history helpers", () => {
  it("extracts plan, worker reports, and final response from a run", () => {
    const artifacts = extractRunArtifacts(events);

    expect(artifacts.plan?.summary).toBe("Plan summary");
    expect(artifacts.workerReports).toHaveLength(1);
    expect(artifacts.finalResponse?.response).toBe("Final response");
    expect(artifacts.totalEvents).toBe(3);
  });

  it("creates a clamped replay slice", () => {
    expect(createReplaySlice(events, 2)).toHaveLength(2);
    expect(createReplaySlice(events, 99)).toHaveLength(3);
    expect(createReplaySlice(events, -1)).toHaveLength(0);
  });

  it("chooses the latest selection from replay events", () => {
    expect(getReplaySelection(events)).toEqual({ nodeId: "dispatcher" });
    expect(getReplaySelection(events.slice(0, 2))).toEqual({
      nodeId: "agent-1",
      taskId: "task-1",
    });
  });
});
