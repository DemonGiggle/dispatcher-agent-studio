import { describe, expect, it } from "vitest";

import { createAgentFromTemplate } from "@/lib/agent-builder";
import {
  createEmptyPersistedStudioState,
  saveRunRecord,
  saveTeamRecord,
} from "@/lib/studio-persistence";

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
});
