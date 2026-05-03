import { getDefaultModel } from "@/lib/model-catalog";
import type { AgentConfig } from "@/lib/types";

export type AgentTemplateDefinition = {
  id: string;
  label: string;
  description: string;
  role: string;
  specialty: string;
  capabilities: string[];
  provider: AgentConfig["provider"];
  model: string;
  temperature: number;
  systemPrompt: string;
  accent: string;
};

export type AgentValidationIssue = {
  scope: "team" | "agent";
  agentId?: string;
  field?: "name" | "role" | "specialty" | "systemPrompt" | "capabilities";
  message: string;
};

export const agentTemplates: AgentTemplateDefinition[] = [
  {
    id: "product",
    label: "Product Strategist",
    description: "Clarifies scope, value, edge cases, and delivery priorities.",
    role: "Product",
    specialty:
      "Clarifies scope, user value, edge cases, and success criteria for the request.",
    capabilities: ["Scope definition", "Prioritization", "Edge cases"],
    provider: "anthropic",
    model: "claude-sonnet-4-5",
    temperature: 0.4,
    systemPrompt:
      "You are a product-minded specialist. Identify requirements, UX tradeoffs, assumptions, and missing decisions. Return practical recommendations the dispatcher can synthesize.",
    accent: "#7c3aed",
  },
  {
    id: "architect",
    label: "System Architect",
    description: "Shapes the runtime, data flow, contracts, and technical sequencing.",
    role: "Architecture",
    specialty:
      "Designs the system shape, data flow, orchestration contracts, and technical decomposition.",
    capabilities: ["Architecture", "Data flow", "Execution design"],
    provider: "openai",
    model: getDefaultModel("openai"),
    temperature: 0.35,
    systemPrompt:
      "You are a senior system architect. Produce implementation-ready technical structure, interfaces, and sequencing. Keep the design grounded and concrete.",
    accent: "#0ea5e9",
  },
  {
    id: "ux",
    label: "UX Visualizer",
    description: "Turns orchestration behavior into clear UI states and interaction flows.",
    role: "Design",
    specialty:
      "Translates behavior into UI states, graph visualization ideas, and interaction details.",
    capabilities: ["UI states", "Interaction flow", "Visual hierarchy"],
    provider: "google",
    model: "gemini-2.5-flash",
    temperature: 0.5,
    systemPrompt:
      "You are a UX and visualization specialist. Focus on clear user flows, status visibility, visual hierarchy, graph states, and explainable interfaces.",
    accent: "#f97316",
  },
  {
    id: "research",
    label: "Research Specialist",
    description: "Finds domain context, risks, and supporting details for the plan.",
    role: "Research",
    specialty:
      "Investigates domain context, references, risks, and supporting details for the task.",
    capabilities: ["Research", "Risk discovery", "Supporting evidence"],
    provider: "mock",
    model: getDefaultModel("mock"),
    temperature: 0.35,
    systemPrompt:
      "You are a research specialist. Surface supporting context, open questions, and notable risks in a concise, synthesis-friendly format.",
    accent: "#22c55e",
  },
];

export function getAgentTemplate(templateId: string): AgentTemplateDefinition | undefined {
  return agentTemplates.find((template) => template.id === templateId);
}

export function createAgentFromTemplate(
  templateId: string,
  id: string,
  overrides: Partial<AgentConfig> = {},
): AgentConfig {
  const template = getAgentTemplate(templateId) ?? agentTemplates[0]!;
  const capabilities = overrides.capabilities
    ? [...overrides.capabilities]
    : [...template.capabilities];

  return {
    id,
    name: template.label,
    role: template.role,
    specialty: template.specialty,
    provider: template.provider,
    model: template.model,
    temperature: template.temperature,
    systemPrompt: template.systemPrompt,
    accent: template.accent,
    enabled: true,
    templateId: template.id,
    capabilities,
    ...overrides,
  };
}

export function createBlankAgent(id: string, accent: string): AgentConfig {
  return {
    id,
    name: "Custom Specialist",
    role: "Specialist",
    specialty: "Describe what this agent is best at.",
    capabilities: ["Custom capability"],
    provider: "mock",
    model: getDefaultModel("mock"),
    temperature: 0.45,
    systemPrompt:
      "You are a focused specialist. Return structured, practical recommendations for the assigned task.",
    accent,
    enabled: true,
    templateId: "custom",
  };
}

export function duplicateAgent(agent: AgentConfig, id: string): AgentConfig {
  return {
    ...agent,
    id,
    name: `${agent.name} Copy`,
    capabilities: [...agent.capabilities],
  };
}

export function getEnabledAgents(agents: AgentConfig[]): AgentConfig[] {
  return agents.filter((agent) => agent.enabled);
}

function normalizeValue(value: string): string {
  return value.trim().toLowerCase();
}

export function validateAgentTeam(agents: AgentConfig[]): AgentValidationIssue[] {
  const issues: AgentValidationIssue[] = [];
  const enabledAgents = getEnabledAgents(agents);

  if (enabledAgents.length === 0) {
    issues.push({
      scope: "team",
      message: "Enable at least one agent before starting a run.",
    });
  }

  const nameOwners = new Map<string, string>();
  const roleSpecialtyOwners = new Map<string, string>();

  for (const agent of enabledAgents) {
    const fields: Array<{
      field: AgentValidationIssue["field"];
      value: string;
      label: string;
    }> = [
      { field: "name", value: agent.name, label: "name" },
      { field: "role", value: agent.role, label: "role" },
      { field: "specialty", value: agent.specialty, label: "specialty" },
      { field: "systemPrompt", value: agent.systemPrompt, label: "system prompt" },
    ];

    for (const field of fields) {
      if (field.value.trim().length === 0) {
        issues.push({
          scope: "agent",
          agentId: agent.id,
          field: field.field,
          message: `${agent.name || "Agent"} needs a ${field.label}.`,
        });
      }
    }

    if (agent.capabilities.length === 0) {
      issues.push({
        scope: "agent",
        agentId: agent.id,
        field: "capabilities",
        message: `${agent.name || "Agent"} needs at least one capability.`,
      });
    }

    const normalizedName = normalizeValue(agent.name);

    if (normalizedName.length > 0) {
      const priorOwner = nameOwners.get(normalizedName);

      if (priorOwner && priorOwner !== agent.id) {
        issues.push({
          scope: "agent",
          agentId: agent.id,
          field: "name",
          message: `Enabled agents must use distinct names. "${agent.name}" is duplicated.`,
        });
      } else {
        nameOwners.set(normalizedName, agent.id);
      }
    }

    const roleSpecialtyKey = `${normalizeValue(agent.role)}::${normalizeValue(agent.specialty)}`;

    if (roleSpecialtyKey !== "::") {
      const priorOwner = roleSpecialtyOwners.get(roleSpecialtyKey);

      if (priorOwner && priorOwner !== agent.id) {
        issues.push({
          scope: "agent",
          agentId: agent.id,
          field: "specialty",
          message: `${agent.name} overlaps with another enabled agent's role and specialty. Differentiate the team before running.`,
        });
      } else {
        roleSpecialtyOwners.set(roleSpecialtyKey, agent.id);
      }
    }
  }

  return issues;
}
