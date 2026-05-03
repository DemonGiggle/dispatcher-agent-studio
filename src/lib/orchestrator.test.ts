import { describe, expect, it } from "vitest";

import {
  cloneAgentConfigs,
  cloneDispatcherConfig,
  cloneRuntimeOptions,
} from "@/lib/defaults";
import {
  runOrchestration,
  type OrchestrationExecutor,
} from "@/lib/orchestrator";
import { ProviderExecutionError } from "@/lib/providers";
import type {
  DispatcherPlan,
  OrchestrationEvent,
  OrchestrationRequest,
  ProviderExecutionMeta,
} from "@/lib/types";

const mockMeta: ProviderExecutionMeta = {
  requestedProvider: "mock",
  requestedModel: "test-model",
  effectiveProvider: "mock",
  effectiveModel: "test-model",
  mode: "mock",
};

function createRequest(): OrchestrationRequest {
  const agents = cloneAgentConfigs();

  return {
    prompt: "Design a robust multi-agent orchestration workflow.",
    messages: [],
    dispatcher: cloneDispatcherConfig(),
    agents,
    runtime: {
      ...cloneRuntimeOptions(),
      maxParallelTasks: 2,
      maxTaskRetries: 1,
      taskTimeoutMs: 2_000,
      dispatcherTimeoutMs: 2_000,
    },
  };
}

function createPlan(request: OrchestrationRequest): DispatcherPlan {
  const [product, architect, ux] = request.agents;

  return {
    summary: "Split product discovery, architecture, then UX synthesis.",
    tasks: [
      {
        id: "task-1",
        agentId: product.id,
        title: "Product framing",
        objective: "Clarify the product scope.",
        expectedOutput: "A product recommendation memo.",
        dependsOn: [],
      },
      {
        id: "task-2",
        agentId: architect.id,
        title: "Architecture outline",
        objective: "Design the runtime structure.",
        expectedOutput: "An architecture summary.",
        dependsOn: [],
      },
      {
        id: "task-3",
        agentId: ux.id,
        title: "UX synthesis",
        objective: "Turn the earlier findings into a graph-first UX plan.",
        expectedOutput: "A UX recommendation summary.",
        dependsOn: ["task-1", "task-2"],
      },
    ],
    synthesisFocus: ["Unify the recommendations into one response."],
  };
}

async function collectEvents(
  request: OrchestrationRequest,
  executor: OrchestrationExecutor,
  abortSignal?: AbortSignal,
) {
  const events: OrchestrationEvent[] = [];

  const result = await runOrchestration(
    request,
    async (event) => {
      events.push(event);
    },
    {
      executor,
      abortSignal,
    },
  );

  return { events, result };
}

describe("runOrchestration", () => {
  it("respects task dependencies and only starts dependent work after prerequisites complete", async () => {
    const request = createRequest();
    const plan = createPlan(request);
    const trace: string[] = [];

    const executor: OrchestrationExecutor = {
      async generatePlan() {
        return { plan, meta: mockMeta };
      },
      async executeTask({ task, prompt }) {
        trace.push(`start:${task.id}`);
        await new Promise((resolve) =>
          setTimeout(resolve, task.id === "task-1" ? 35 : task.id === "task-2" ? 10 : 1),
        );
        trace.push(`end:${task.id}`);
        return {
          text:
            task.id === "task-3"
              ? `UX summary with dependencies.\n${prompt}`
              : `Output for ${task.id}`,
          meta: mockMeta,
        };
      },
      async synthesize() {
        return { text: "Final synthesis", meta: mockMeta };
      },
    };

    const { events, result } = await collectEvents(request, executor);
    const uxResultEvent = events.find(
      (event) => event.type === "agent-result" && event.task.id === "task-3",
    );

    expect(result).toBe("Final synthesis");
    expect(trace.indexOf("start:task-3")).toBeGreaterThan(trace.indexOf("end:task-1"));
    expect(trace.indexOf("start:task-3")).toBeGreaterThan(trace.indexOf("end:task-2"));
    expect(uxResultEvent && uxResultEvent.type === "agent-result"
      ? uxResultEvent.input
      : "").toContain("Dependency reports:");
    expect(uxResultEvent && uxResultEvent.type === "agent-result"
      ? uxResultEvent.input
      : "").toContain("Output for task-1");
    expect(uxResultEvent && uxResultEvent.type === "agent-result"
      ? uxResultEvent.input
      : "").toContain("Output for task-2");
  });

  it("retries failed tasks and preserves the successful final attempt", async () => {
    const request = createRequest();
    request.agents = request.agents.slice(0, 1);
    request.runtime.maxTaskRetries = 1;

    const attempts = new Map<string, number>();
    const plan: DispatcherPlan = {
      summary: "Single task plan.",
      tasks: [
        {
          id: "task-1",
          agentId: request.agents[0].id,
          title: "Only task",
          objective: "Return a stable result after one retry.",
          expectedOutput: "A final result.",
          dependsOn: [],
        },
      ],
      synthesisFocus: ["Use the successful worker output."],
    };

    const executor: OrchestrationExecutor = {
      async generatePlan() {
        return { plan, meta: mockMeta };
      },
      async executeTask({ task }) {
        const attempt = (attempts.get(task.id) ?? 0) + 1;
        attempts.set(task.id, attempt);

        if (attempt === 1) {
          throw new Error("Transient provider failure");
        }

        return { text: "Recovered task output", meta: mockMeta };
      },
      async synthesize() {
        return { text: "Recovered synthesis", meta: mockMeta };
      },
    };

    const { events, result } = await collectEvents(request, executor);
    const resultEvent = events.find(
      (event) => event.type === "agent-result" && event.task.id === "task-1",
    );

    expect(result).toBe("Recovered synthesis");
    expect(attempts.get("task-1")).toBe(2);
    expect(resultEvent && resultEvent.type === "agent-result"
      ? resultEvent.attempt
      : 0).toBe(2);
    expect(
      events.some(
        (event) =>
          event.type === "node-status" &&
          event.taskId === "task-1" &&
          event.detail.includes("Retrying"),
      ),
    ).toBe(true);
  });

  it("cancels the run cleanly when the external abort signal fires", async () => {
    const request = createRequest();
    request.agents = request.agents.slice(0, 1);

    const plan: DispatcherPlan = {
      summary: "Cancelable task plan.",
      tasks: [
        {
          id: "task-1",
          agentId: request.agents[0].id,
          title: "Long-running task",
          objective: "Stay active until the run is aborted.",
          expectedOutput: "No result because the run is cancelled.",
          dependsOn: [],
        },
      ],
      synthesisFocus: ["No synthesis required after cancellation."],
    };

    const abortController = new AbortController();

    const executor: OrchestrationExecutor = {
      async generatePlan() {
        return { plan, meta: mockMeta };
      },
      async executeTask({ abortSignal }) {
        await new Promise<void>((resolve, reject) => {
          const timeoutId = setTimeout(resolve, 250);

          abortSignal.addEventListener(
            "abort",
            () => {
              clearTimeout(timeoutId);
              reject(abortSignal.reason);
            },
            { once: true },
          );
        });

        return { text: "Should not resolve", meta: mockMeta };
      },
      async synthesize() {
        return { text: "Should not synthesize", meta: mockMeta };
      },
    };

    const runPromise = collectEvents(request, executor, abortController.signal);
    setTimeout(() => abortController.abort(new Error("Stopped by user")), 20);
    const { events, result } = await runPromise;

    expect(result).toBeUndefined();
    expect(events.some((event) => event.type === "run-cancelled")).toBe(true);
    expect(
      events.some(
        (event) =>
          event.type === "node-status" &&
          event.status === "cancelled" &&
          event.taskId === "task-1",
      ),
    ).toBe(true);
  });

  it("fails early when request guardrails are exceeded", async () => {
    const request = createRequest();
    request.prompt = "x".repeat(4_001);

    const executor: OrchestrationExecutor = {
      async generatePlan() {
        throw new Error("generatePlan should not run for invalid requests");
      },
      async executeTask() {
        throw new Error("executeTask should not run for invalid requests");
      },
      async synthesize() {
        throw new Error("synthesize should not run for invalid requests");
      },
    };

    const { events, result } = await collectEvents(request, executor);
    const runError = events.find((event) => event.type === "run-error");

    expect(result).toBeUndefined();
    expect(runError && runError.type === "run-error" ? runError.errorCode : undefined).toBe(
      "prompt-too-large",
    );
    expect(runError && runError.type === "run-error" ? runError.message : "").toContain(
      "Keep it under 4000 characters",
    );
  });

  it("surfaces classified provider failures with explicit error codes", async () => {
    const request = createRequest();
    request.agents = request.agents.slice(0, 1);
    request.runtime.maxTaskRetries = 0;

    const plan: DispatcherPlan = {
      summary: "Single task plan.",
      tasks: [
        {
          id: "task-1",
          agentId: request.agents[0].id,
          title: "Rate-limited task",
          objective: "Exercise provider failure handling.",
          expectedOutput: "A provider error should surface clearly.",
          dependsOn: [],
        },
      ],
      synthesisFocus: ["No synthesis after provider failure."],
    };

    const executor: OrchestrationExecutor = {
      async generatePlan() {
        return { plan, meta: mockMeta };
      },
      async executeTask() {
        throw new ProviderExecutionError(
          "provider-rate-limit",
          "openai",
          "gpt-test",
          "Provider openai/gpt-test failed: rate limit exceeded",
        );
      },
      async synthesize() {
        return { text: "Should not synthesize", meta: mockMeta };
      },
    };

    const { events, result } = await collectEvents(request, executor);
    const taskErrorStatus = events.find(
      (event) =>
        event.type === "node-status" &&
        event.status === "error" &&
        event.taskId === "task-1",
    );
    const runError = events.find((event) => event.type === "run-error");

    expect(result).toBeUndefined();
    expect(
      taskErrorStatus && taskErrorStatus.type === "node-status"
        ? taskErrorStatus.errorCode
        : undefined,
    ).toBe("provider-rate-limit");
    expect(runError && runError.type === "run-error" ? runError.errorCode : undefined).toBe(
      "provider-rate-limit",
    );
  });
});
