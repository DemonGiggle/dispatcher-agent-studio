import { getDefaultModel } from "@/lib/model-catalog";
import type { AgentConfig } from "@/lib/types";

export type AgentTemplateDefinition = {
  id: string;
  label: string;
  description: string;
  category: string;
  role: string;
  specialty: string;
  capabilities: string[];
  keywords: string[];
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
    category: "Product",
    role: "Product",
    specialty:
      "Clarifies scope, user value, edge cases, and success criteria for the request.",
    capabilities: ["Scope definition", "Prioritization", "Edge cases"],
    keywords: ["requirements", "roadmap", "mvp", "scope"],
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
    category: "Architecture",
    role: "Architecture",
    specialty:
      "Designs the system shape, data flow, orchestration contracts, and technical decomposition.",
    capabilities: ["Architecture", "Data flow", "Execution design"],
    keywords: ["system design", "interfaces", "contracts", "runtime"],
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
    category: "Design",
    role: "Design",
    specialty:
      "Translates behavior into UI states, graph visualization ideas, and interaction details.",
    capabilities: ["UI states", "Interaction flow", "Visual hierarchy"],
    keywords: ["ux", "ui", "journeys", "layout"],
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
    category: "Research",
    role: "Research",
    specialty:
      "Investigates domain context, references, risks, and supporting details for the task.",
    capabilities: ["Research", "Risk discovery", "Supporting evidence"],
    keywords: ["analysis", "references", "domain", "risks"],
    provider: "mock",
    model: getDefaultModel("mock"),
    temperature: 0.35,
    systemPrompt:
      "You are a research specialist. Surface supporting context, open questions, and notable risks in a concise, synthesis-friendly format.",
    accent: "#22c55e",
  },
  {
    id: "embedded-datasheet",
    label: "DataSheet Consultant",
    description:
      "Extracts requirements, limits, and bring-up constraints from MCU, sensor, and PMIC datasheets.",
    category: "Embedded Engineer",
    role: "Embedded Engineer",
    specialty:
      "Maps datasheet details into pin plans, timing limits, electrical constraints, and implementation checklists.",
    capabilities: ["Datasheet review", "Pin planning", "Electrical constraints"],
    keywords: ["datasheet", "mcu", "sensor", "pmic", "pin mux"],
    provider: "anthropic",
    model: "claude-sonnet-4-5",
    temperature: 0.25,
    systemPrompt:
      "You are an embedded datasheet consultant. Translate component datasheets into implementation constraints, register considerations, pin planning notes, and concrete engineering guidance.",
    accent: "#38bdf8",
  },
  {
    id: "embedded-arm",
    label: "Arm Consultant",
    description:
      "Advises on Cortex-M architecture, startup code, CMSIS usage, and low-level debugging paths.",
    category: "Embedded Engineer",
    role: "Embedded Engineer",
    specialty:
      "Guides Arm core bring-up, memory layout, exception handling, and architecture-aware firmware decisions.",
    capabilities: ["Arm architecture", "CMSIS", "Core bring-up"],
    keywords: ["arm", "cortex-m", "cmsis", "startup", "nvic"],
    provider: "openai",
    model: getDefaultModel("openai"),
    temperature: 0.3,
    systemPrompt:
      "You are an Arm consultant for embedded systems. Focus on Cortex-M startup flows, memory maps, interrupt behavior, CMSIS integration, and architecture-specific debugging advice.",
    accent: "#f59e0b",
  },
  {
    id: "embedded-bringup",
    label: "Board Bring-up Engineer",
    description:
      "Turns schematics, boot logs, and lab symptoms into a structured bring-up sequence.",
    category: "Embedded Engineer",
    role: "Embedded Engineer",
    specialty:
      "Owns first-power-on triage, clock and reset validation, rail checks, and board-level debug planning.",
    capabilities: ["Board bring-up", "Clock/reset checks", "Boot triage"],
    keywords: ["bring-up", "schematic", "boot log", "power rail", "oscillator"],
    provider: "google",
    model: "gemini-2.5-flash",
    temperature: 0.35,
    systemPrompt:
      "You are a board bring-up specialist. Build clear, low-risk debug sequences for power, reset, clocking, peripheral readiness, and first boot validation.",
    accent: "#10b981",
  },
  {
    id: "embedded-driver",
    label: "Peripheral Driver Engineer",
    description:
      "Designs robust HAL and bare-metal drivers for buses, sensors, and control peripherals.",
    category: "Embedded Engineer",
    role: "Embedded Engineer",
    specialty:
      "Breaks down peripheral integration into initialization, data transfer, fault handling, and validation steps.",
    capabilities: ["Driver design", "HAL integration", "Peripheral validation"],
    keywords: ["i2c", "spi", "uart", "dma", "driver"],
    provider: "openai",
    model: getDefaultModel("openai"),
    temperature: 0.3,
    systemPrompt:
      "You are a peripheral driver engineer. Produce reliable embedded driver guidance with attention to initialization order, timing, DMA usage, interrupts, and error recovery.",
    accent: "#06b6d4",
  },
  {
    id: "embedded-rtos",
    label: "RTOS Integrator",
    description:
      "Shapes task models, interrupt handoffs, and concurrency patterns for real-time firmware.",
    category: "Embedded Engineer",
    role: "Embedded Engineer",
    specialty:
      "Balances task design, ISR boundaries, latency, queues, and synchronization for maintainable RTOS systems.",
    capabilities: ["RTOS design", "Latency tuning", "Task orchestration"],
    keywords: ["rtos", "freertos", "tasks", "interrupts", "queues"],
    provider: "anthropic",
    model: "claude-sonnet-4-5",
    temperature: 0.3,
    systemPrompt:
      "You are an RTOS integration specialist. Recommend practical task structures, ISR/task boundaries, synchronization patterns, and timing-safe real-time designs.",
    accent: "#8b5cf6",
  },
  {
    id: "embedded-debug",
    label: "Firmware Debugger",
    description:
      "Investigates crashes, lockups, and timing bugs with register-level and trace-driven reasoning.",
    category: "Embedded Engineer",
    role: "Embedded Engineer",
    specialty:
      "Uses logs, fault registers, trace output, and toolchain clues to isolate firmware failures quickly.",
    capabilities: ["Crash triage", "SWD/JTAG workflows", "Fault analysis"],
    keywords: ["debug", "hardfault", "jtag", "swd", "trace"],
    provider: "mock",
    model: getDefaultModel("mock"),
    temperature: 0.25,
    systemPrompt:
      "You are a firmware debugger. Diagnose embedded failures using fault context, logs, register state, and probable timing interactions. Prefer concrete debug steps over theory.",
    accent: "#ef4444",
  },
];

export function getAgentTemplate(templateId: string): AgentTemplateDefinition | undefined {
  return agentTemplates.find((template) => template.id === templateId);
}

export function filterAgentTemplates(
  templates: AgentTemplateDefinition[],
  {
    category = "all",
    query = "",
  }: {
    category?: string;
    query?: string;
  } = {},
): AgentTemplateDefinition[] {
  const normalizedCategory = normalizeValue(category);
  const normalizedQuery = normalizeValue(query);

  return templates.filter((template) => {
    const matchesCategory =
      normalizedCategory.length === 0 ||
      normalizedCategory === "all" ||
      normalizeValue(template.category) === normalizedCategory;

    if (!matchesCategory) {
      return false;
    }

    if (normalizedQuery.length === 0) {
      return true;
    }

    const searchContent = [
      template.label,
      template.description,
      template.category,
      template.role,
      template.specialty,
      ...template.capabilities,
      ...template.keywords,
    ]
      .join(" ")
      .toLowerCase();

    return searchContent.includes(normalizedQuery);
  });
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
