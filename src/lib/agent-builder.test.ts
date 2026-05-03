import { describe, expect, it } from "vitest";

import { createAgentFromTemplate, getEnabledAgents, validateAgentTeam } from "@/lib/agent-builder";
import { cloneAgentConfigs } from "@/lib/defaults";

describe("agent builder helpers", () => {
  it("filters disabled agents out of the execution roster", () => {
    const agents = cloneAgentConfigs();
    agents[1].enabled = false;

    expect(getEnabledAgents(agents).map((agent) => agent.id)).toEqual([
      agents[0].id,
      agents[2].id,
    ]);
  });

  it("requires at least one enabled agent", () => {
    const agents = cloneAgentConfigs().map((agent) => ({
      ...agent,
      enabled: false,
    }));

    const issues = validateAgentTeam(agents);

    expect(issues.map((issue) => issue.message)).toContain(
      "Enable at least one agent before starting a run.",
    );
  });

  it("requires enabled agents to declare at least one capability", () => {
    const agents = [
      createAgentFromTemplate("architect", "agent-1", {
        capabilities: [],
      }),
    ];

    const issues = validateAgentTeam(agents);

    expect(issues.some((issue) => issue.field === "capabilities")).toBe(true);
  });

  it("flags conflicting enabled agent definitions", () => {
    const agent = createAgentFromTemplate("product", "agent-1");
    const duplicate = createAgentFromTemplate("product", "agent-2");

    const issues = validateAgentTeam([agent, duplicate]);

    expect(issues.some((issue) => issue.field === "name")).toBe(true);
    expect(issues.some((issue) => issue.field === "specialty")).toBe(true);
  });
});
