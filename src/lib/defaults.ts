import type {
  AgentConfig,
  ConversationMessage,
  DispatcherConfig,
  OrchestrationRuntimeOptions,
} from "@/lib/types";
import { getDefaultModel } from "@/lib/model-catalog";

export const defaultDispatcher: DispatcherConfig = {
  id: "dispatcher",
  name: "Dispatcher",
  provider: "openai",
  model: getDefaultModel("openai"),
  temperature: 0.3,
  systemPrompt:
    "You are the lead dispatcher for a multi-agent studio. Break the user's request into clear tasks, route each task to the best specialist, and produce a final synthesis that sounds like one coherent answer. Prefer clear scope boundaries, explicit expected outputs, and minimal overlap between agents.",
};

export const defaultAgents: AgentConfig[] = [
  {
    id: "agent-product",
    name: "Product Strategist",
    role: "Product",
    specialty:
      "Clarifies scope, user value, edge cases, and success criteria for the request.",
    provider: "anthropic",
    model: "claude-sonnet-4-5",
    temperature: 0.4,
    systemPrompt:
      "You are a product-minded specialist. Identify requirements, UX tradeoffs, assumptions, and missing decisions. Return practical recommendations the dispatcher can synthesize.",
    accent: "#7c3aed",
  },
  {
    id: "agent-architect",
    name: "System Architect",
    role: "Architecture",
    specialty:
      "Designs the system shape, data flow, orchestration contracts, and technical decomposition.",
    provider: "openai",
    model: getDefaultModel("openai"),
    temperature: 0.35,
    systemPrompt:
      "You are a senior system architect. Produce implementation-ready technical structure, interfaces, and sequencing. Keep the design grounded and concrete.",
    accent: "#0ea5e9",
  },
  {
    id: "agent-ux",
    name: "UX Visualizer",
    role: "Design",
    specialty:
      "Translates behavior into UI states, graph visualization ideas, and interaction details.",
    provider: "google",
    model: "gemini-2.5-flash",
    temperature: 0.5,
    systemPrompt:
      "You are a UX and visualization specialist. Focus on clear user flows, status visibility, visual hierarchy, graph states, and explainable interfaces.",
    accent: "#f97316",
  },
];

export const starterMessages: ConversationMessage[] = [
  {
    id: "welcome",
    role: "assistant",
    content:
      "Ready to orchestrate. Describe a task, and the dispatcher will split it across specialists, collect their reports, and answer with a synthesized result.",
  },
];

export const samplePrompts = [
  "幫我規劃一個旅行行程網站，含資料結構、頁面與 MVP 切分。",
  "設計一個客服自動化流程，包含分類、知識庫檢索與人工轉接。",
  "我要做一個內部 dashboard，幫我拆成資料、權限、前端互動三個面向。",
];

export const defaultRuntimeOptions: OrchestrationRuntimeOptions = {
  maxParallelTasks: 2,
  maxTaskRetries: 1,
  taskTimeoutMs: 45_000,
  dispatcherTimeoutMs: 45_000,
};

export function cloneDispatcherConfig(): DispatcherConfig {
  return { ...defaultDispatcher };
}

export function cloneAgentConfigs(): AgentConfig[] {
  return defaultAgents.map((agent) => ({ ...agent }));
}

export function cloneStarterMessages(): ConversationMessage[] {
  return starterMessages.map((message) => ({ ...message }));
}

export function cloneRuntimeOptions(): OrchestrationRuntimeOptions {
  return { ...defaultRuntimeOptions };
}
