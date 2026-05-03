import { afterEach, describe, expect, it, vi } from "vitest";

import { createAgentFromTemplate } from "@/lib/agent-builder";
import {
  createEmptyPersistedStudioState,
  savePersistedStudioState,
  saveRunRecord,
  saveTeamRecord,
} from "@/lib/studio-persistence";
import type { PersistedStudioState } from "@/lib/studio-persistence";
import type { OrchestrationEvent } from "@/lib/types";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function createPersistedState(overrides: Partial<PersistedStudioState> = {}): PersistedStudioState {
  const agent = createAgentFromTemplate("product", "agent-1");

  return {
    schemaVersion: 1,
    autosavedStudio: {
      dispatcher: {
        id: "dispatcher",
        name: "Dispatcher",
        provider: "mock",
        model: "demo-dispatcher",
        temperature: 0.3,
        systemPrompt: "Test",
      },
      agents: [agent],
      messages: [],
      draft: "Draft",
    },
    savedTeams: [],
    recentRuns: [],
    ...overrides,
  };
}

describe("studio persistence helpers", () => {
  it("creates an empty state with the current schema version", () => {
    expect(createEmptyPersistedStudioState()).toEqual({
      schemaVersion: 1,
      autosavedStudio: undefined,
      savedTeams: [],
      recentRuns: [],
    });
  });

  it("prepends recent runs and keeps the latest entry by id", () => {
    const agent = createAgentFromTemplate("product", "agent-1");
    const baseRun = {
      title: "Run",
      prompt: "Prompt",
      createdAt: "2026-05-03T00:00:00.000Z",
      status: "completed" as const,
      dispatcher: {
        id: "dispatcher" as const,
        name: "Dispatcher",
        provider: "mock" as const,
        model: "demo-dispatcher",
        temperature: 0.3,
        systemPrompt: "Test",
      },
      agents: [agent],
      messages: [],
      events: [],
    };

    const recentRuns = saveRunRecord(
      saveRunRecord([], { id: "run-1", ...baseRun }),
      { id: "run-1", ...baseRun, title: "Updated run" },
    );

    expect(recentRuns).toHaveLength(1);
    expect(recentRuns[0]?.title).toBe("Updated run");
  });

  it("prepends saved teams and keeps the latest entry by id", () => {
    const agent = createAgentFromTemplate("product", "agent-1");
    const dispatcher = {
      id: "dispatcher" as const,
      name: "Dispatcher",
      provider: "mock" as const,
      model: "demo-dispatcher",
      temperature: 0.3,
      systemPrompt: "Test",
    };

    const savedTeams = saveTeamRecord(
      saveTeamRecord([], {
        id: "team-1",
        name: "Original",
        savedAt: "2026-05-03T00:00:00.000Z",
        dispatcher,
        agents: [agent],
      }),
      {
        id: "team-1",
        name: "Updated",
        savedAt: "2026-05-03T00:10:00.000Z",
        dispatcher,
        agents: [agent],
      },
    );

    expect(savedTeams).toHaveLength(1);
    expect(savedTeams[0]?.name).toBe("Updated");
  });

  it("compacts oversized event text before saving", () => {
    let storedValue = "";
    const setItem = vi.fn((key: string, value: string) => {
      expect(key).toBe("dispatcher-agent-studio:v1");
      storedValue = value;
    });

    vi.stubGlobal("window", {
      localStorage: {
        getItem: vi.fn(),
        setItem,
      },
    });

    const oversizedText = "x".repeat(5_200);
    const events: OrchestrationEvent[] = [
      {
        schemaVersion: 1,
        eventId: "evt-1",
        runId: "run-1",
        timestamp: "2026-05-03T00:00:00.000Z",
        type: "node-chunk",
        nodeId: "agent-1",
        phase: "task",
        title: "Chunk",
        detail: oversizedText,
        sequence: 1,
        input: oversizedText,
        chunk: oversizedText,
        aggregate: oversizedText,
        provider: {
          requestedProvider: "mock",
          requestedModel: "demo-model",
          effectiveProvider: "mock",
          effectiveModel: "demo-model",
          mode: "mock",
        },
      },
    ];

    const result = savePersistedStudioState(
      createPersistedState({
        recentRuns: [
          {
            id: "run-1",
            title: "Run",
            prompt: "Prompt",
            createdAt: "2026-05-03T00:00:00.000Z",
            status: "completed",
            dispatcher: {
              id: "dispatcher",
              name: "Dispatcher",
              provider: "mock",
              model: "demo-dispatcher",
              temperature: 0.3,
              systemPrompt: "Test",
            },
            agents: [createAgentFromTemplate("product", "agent-1")],
            messages: [{ id: "msg-1", role: "assistant", content: oversizedText }],
            events,
          },
        ],
      }),
    );

    expect(result).toEqual({ status: "saved", retainedRuns: 1 });

    const storedState = JSON.parse(storedValue) as PersistedStudioState;
    const storedRun = storedState.recentRuns[0];
    const storedEvent = storedRun?.events[0];
    const storedMessage = storedRun?.messages[0];

    expect(storedMessage?.content).toContain("[truncated 200 chars]");
    expect(storedEvent?.type).toBe("node-chunk");
    expect(storedEvent && storedEvent.type === "node-chunk" ? storedEvent.aggregate : "").toContain(
      "[truncated 200 chars]",
    );
    expect(setItem).toHaveBeenCalledOnce();
  });

  it("drops older recent runs when the storage quota is exceeded", () => {
    let storedValue = "";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const setItem = vi.fn((_key: string, value: string) => {
      const parsed = JSON.parse(value) as PersistedStudioState;

      if (parsed.recentRuns.length > 4) {
        throw new DOMException("Storage full", "QuotaExceededError");
      }

      storedValue = value;
    });

    vi.stubGlobal("window", {
      localStorage: {
        getItem: vi.fn(),
        setItem,
      },
    });

    const agent = createAgentFromTemplate("product", "agent-1");
    const recentRuns = Array.from({ length: 8 }, (_, index) => ({
      id: `run-${index + 1}`,
      title: `Run ${index + 1}`,
      prompt: `Prompt ${index + 1}`,
      createdAt: "2026-05-03T00:00:00.000Z",
      status: "completed" as const,
      dispatcher: {
        id: "dispatcher" as const,
        name: "Dispatcher",
        provider: "mock" as const,
        model: "demo-dispatcher",
        temperature: 0.3,
        systemPrompt: "Test",
      },
      agents: [agent],
      messages: [],
      events: [],
    }));

    const result = savePersistedStudioState(
      createPersistedState({
        recentRuns,
      }),
    );

    expect(result).toEqual({ status: "degraded", retainedRuns: 4, droppedRuns: 4 });
    expect(JSON.parse(storedValue)).toMatchObject({
      recentRuns: recentRuns.slice(0, 4).map((run) => ({ id: run.id })),
    });
    expect(warnSpy).toHaveBeenCalledWith(
      "Studio persistence trimmed recent runs to fit browser storage.",
      expect.objectContaining({
        retainedRuns: 4,
        droppedRuns: 4,
      }),
    );
  });

  it("reports a failed save when localStorage throws a non-quota error", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    vi.stubGlobal("window", {
      localStorage: {
        getItem: vi.fn(),
        setItem: vi.fn(() => {
          throw new DOMException("Blocked", "SecurityError");
        }),
      },
    });

    const result = savePersistedStudioState(
      createPersistedState({
        recentRuns: [
          {
            id: "run-1",
            title: "Run 1",
            prompt: "Prompt 1",
            createdAt: "2026-05-03T00:00:00.000Z",
            status: "completed",
            dispatcher: {
              id: "dispatcher",
              name: "Dispatcher",
              provider: "mock",
              model: "demo-dispatcher",
              temperature: 0.3,
              systemPrompt: "Test",
            },
            agents: [createAgentFromTemplate("product", "agent-1")],
            messages: [],
            events: [],
          },
        ],
      }),
    );

    expect(result).toEqual({ status: "failed", retainedRuns: 0, droppedRuns: 1 });
    expect(errorSpy).toHaveBeenCalledWith(
      "Studio persistence failed unexpectedly.",
      expect.any(DOMException),
    );
  });
});
