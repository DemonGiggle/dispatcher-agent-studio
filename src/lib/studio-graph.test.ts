import { describe, expect, it } from "vitest";

import {
  cloneAgentConfigs,
  cloneDispatcherConfig,
} from "@/lib/defaults";
import { deriveRunSnapshot } from "@/lib/studio-graph";
import type { OrchestrationEvent, ProviderExecutionMeta } from "@/lib/types";

const mockMeta: ProviderExecutionMeta = {
  requestedProvider: "mock",
  requestedModel: "demo-specialist",
  effectiveProvider: "mock",
  effectiveModel: "demo-specialist",
  mode: "mock",
};

const baseEvent = {
  schemaVersion: 2 as const,
  runId: "run-graph",
  timestamp: "2026-05-03T12:00:00.000Z",
};

describe("deriveRunSnapshot", () => {
  it("reconstructs task, warning, and failure state from stored events", () => {
    const dispatcher = cloneDispatcherConfig();
    const [productAgent, architectAgent] = cloneAgentConfigs();
    const agents = [productAgent, architectAgent];

    const events: OrchestrationEvent[] = [
      {
        ...baseEvent,
        eventId: "evt-1",
        type: "run-start",
        prompt: "Plan a roadmap",
        dispatcherId: "dispatcher",
        agentIds: agents.map((agent) => agent.id),
      },
      {
        ...baseEvent,
        eventId: "evt-2",
        type: "provider-warning",
        nodeId: productAgent.id,
        errorCode: "provider-auth",
        message: "OPENAI_API_KEY is not set. Falling back to mock mode.",
        provider: {
          requestedProvider: "openai",
          requestedModel: "gpt-4.1",
          effectiveProvider: "mock",
          effectiveModel: "mock:gpt-4.1",
          mode: "mock",
          warning: "OPENAI_API_KEY is not set. Falling back to mock mode.",
        },
      },
      {
        ...baseEvent,
        eventId: "evt-3",
        type: "dispatcher-plan",
        nodeId: "dispatcher",
        summary: "Split product and architecture work.",
        tasks: [
          {
            id: "task-product",
            agentId: productAgent.id,
            title: "Product brief",
            objective: "Write the product scope.",
            expectedOutput: "Product recommendations",
            dependsOn: [],
          },
          {
            id: "task-arch",
            agentId: architectAgent.id,
            title: "Architecture review",
            objective: "Design the system layout.",
            expectedOutput: "Architecture recommendations",
            dependsOn: ["task-product"],
          },
        ],
        synthesisFocus: ["Combine the specialist recommendations."],
        input: "Dispatcher planning input",
        output: "Dispatcher planning output",
        provider: mockMeta,
      },
      {
        ...baseEvent,
        eventId: "evt-4",
        type: "task-assignment",
        nodeId: productAgent.id,
        dispatcherId: "dispatcher",
        task: {
          id: "task-product",
          agentId: productAgent.id,
          title: "Product brief",
          objective: "Write the product scope.",
          expectedOutput: "Product recommendations",
          dependsOn: [],
        },
        detail: "Product specialist is taking the first task.",
      },
      {
        ...baseEvent,
        eventId: "evt-5",
        type: "node-chunk",
        nodeId: productAgent.id,
        phase: "task",
        title: "Product brief",
        detail: "Drafting the product brief.",
        sequence: 1,
        taskId: "task-product",
        attempt: 1,
        input: "Product task prompt",
        chunk: "Draft",
        aggregate: "Draft product output",
        provider: mockMeta,
      },
      {
        ...baseEvent,
        eventId: "evt-6",
        type: "agent-result",
        nodeId: productAgent.id,
        task: {
          id: "task-product",
          agentId: productAgent.id,
          title: "Product brief",
          objective: "Write the product scope.",
          expectedOutput: "Product recommendations",
          dependsOn: [],
        },
        attempt: 1,
        input: "Product task prompt",
        output: "Final product recommendation",
        provider: mockMeta,
      },
      {
        ...baseEvent,
        eventId: "evt-7",
        type: "task-assignment",
        nodeId: architectAgent.id,
        dispatcherId: "dispatcher",
        task: {
          id: "task-arch",
          agentId: architectAgent.id,
          title: "Architecture review",
          objective: "Design the system layout.",
          expectedOutput: "Architecture recommendations",
          dependsOn: ["task-product"],
        },
        detail: "Architect is taking the second task.",
      },
      {
        ...baseEvent,
        eventId: "evt-8",
        type: "run-error",
        nodeId: architectAgent.id,
        errorCode: "task-failed",
        message: "Architecture task failed after retries.",
      },
    ];

    const snapshot = deriveRunSnapshot(dispatcher, agents, events);

    expect(snapshot.tasks).toHaveLength(2);
    expect(snapshot.nodeSnapshots.user.latestOutput).toBe("Plan a roadmap");
    expect(snapshot.nodeSnapshots.dispatcher.detail).toBe(
      "Split product and architecture work.",
    );
    expect(snapshot.nodeSnapshots[productAgent.id]).toMatchObject({
      status: "completed",
      provider: "mock",
      model: "demo-specialist",
      latestOutput: "Final product recommendation",
      warningCodes: ["provider-auth"],
    });
    expect(snapshot.taskSnapshots["task-product"]).toMatchObject({
      status: "completed",
      latestOutput: "Final product recommendation",
      attempt: 1,
    });
    expect(snapshot.nodeSnapshots[architectAgent.id]).toMatchObject({
      status: "error",
      errorCode: "task-failed",
      detail: "Architecture task failed after retries.",
    });
    expect(snapshot.taskSnapshots["task-arch"]).toMatchObject({
      status: "error",
      detail: "Architecture task failed after retries.",
    });
  });
});
