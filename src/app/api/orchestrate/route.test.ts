import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  cloneAgentConfigs,
  cloneDispatcherConfig,
  cloneRuntimeOptions,
} from "@/lib/defaults";
import type { OrchestrationEvent } from "@/lib/types";

vi.mock("@/lib/orchestrator", () => ({
  runOrchestration: vi.fn(),
}));

import { POST } from "@/app/api/orchestrate/route";
import { runOrchestration } from "@/lib/orchestrator";

function createValidPayload() {
  return {
    prompt: "Design a roadmap.",
    messages: [],
    dispatcher: cloneDispatcherConfig(),
    agents: cloneAgentConfigs(),
    runtime: cloneRuntimeOptions(),
  };
}

function createEvent(
  overrides: Partial<OrchestrationEvent> & Pick<OrchestrationEvent, "type" | "eventId">,
): OrchestrationEvent {
  return {
    schemaVersion: 2,
    runId: "run-route",
    timestamp: "2026-05-03T12:30:00.000Z",
    nodeId: "dispatcher",
    ...overrides,
  } as OrchestrationEvent;
}

describe("POST /api/orchestrate", () => {
  beforeEach(() => {
    vi.mocked(runOrchestration).mockReset();
  });

  it("returns an invalid-json error for malformed request bodies", async () => {
    const response = await POST(
      new Request("http://localhost/api/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{not valid json",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid JSON payload.",
      errorCode: "invalid-json",
    });
  });

  it("returns an invalid-request error when payload validation fails", async () => {
    const response = await POST(
      new Request("http://localhost/api/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "Missing dispatcher and agents" }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid request payload.",
      errorCode: "invalid-request",
    });
  });

  it("streams sanitized NDJSON events with the schema version header", async () => {
    const oversizedResponse = "x".repeat(5_051);

    vi.mocked(runOrchestration).mockImplementation(async (_request, onEvent) => {
      await onEvent(
        createEvent({
          type: "final-response",
          eventId: "evt-final",
          response: oversizedResponse,
          input: "Synthesis input",
          output: oversizedResponse,
          provider: {
            requestedProvider: "mock",
            requestedModel: "demo-dispatcher",
            effectiveProvider: "mock",
            effectiveModel: "demo-dispatcher",
            mode: "mock",
          },
        }),
      );

      return "done";
    });

    const response = await POST(
      new Request("http://localhost/api/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createValidPayload()),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/x-ndjson");
    expect(response.headers.get("X-Orchestration-Event-Schema-Version")).toBe("2");

    const lines = (await response.text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as OrchestrationEvent);

    expect(lines).toHaveLength(1);
    expect(lines[0].type).toBe("final-response");
    expect(lines[0].type === "final-response" ? lines[0].response : "").toContain(
      "[truncated 51 chars]",
    );
    expect(vi.mocked(runOrchestration)).toHaveBeenCalledOnce();
  });

  it("emits a run-error event when orchestration throws unexpectedly", async () => {
    vi.mocked(runOrchestration).mockRejectedValue(new Error("Unexpected crash"));

    const response = await POST(
      new Request("http://localhost/api/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createValidPayload()),
      }),
    );

    const lines = (await response.text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as OrchestrationEvent);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      type: "run-error",
      nodeId: "dispatcher",
      errorCode: "internal-error",
      message: "Unexpected crash",
    });
  });
});
