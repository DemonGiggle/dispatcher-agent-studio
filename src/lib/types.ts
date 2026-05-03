import { z } from "zod";

export const providerIds = ["mock", "openai", "anthropic", "google"] as const;

export type ProviderId = (typeof providerIds)[number];
export type NodeStatus =
  | "idle"
  | "planning"
  | "queued"
  | "running"
  | "synthesizing"
  | "completed"
  | "error";

export const llmSelectionSchema = z.object({
  provider: z.enum(providerIds),
  model: z.string().min(1),
  temperature: z.number().min(0).max(1.5).default(0.7),
});

export const dispatcherConfigSchema = llmSelectionSchema.extend({
  id: z.literal("dispatcher"),
  name: z.string().min(1),
  systemPrompt: z.string().min(1),
});

export const agentConfigSchema = llmSelectionSchema.extend({
  id: z.string().min(1),
  name: z.string().min(1),
  role: z.string().min(1),
  specialty: z.string().min(1),
  systemPrompt: z.string().min(1),
  accent: z.string().min(1),
});

export const conversationMessageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
});

export const planTaskSchema = z.object({
  id: z.string().min(1),
  agentId: z.string().min(1),
  title: z.string().min(1),
  objective: z.string().min(1),
  expectedOutput: z.string().min(1),
});

export const dispatcherPlanSchema = z.object({
  summary: z.string().min(1),
  tasks: z.array(planTaskSchema).max(8),
  synthesisFocus: z.array(z.string().min(1)).min(1).max(6),
});

export const orchestrationRequestSchema = z.object({
  prompt: z.string().min(1),
  messages: z.array(conversationMessageSchema).default([]),
  dispatcher: dispatcherConfigSchema,
  agents: z.array(agentConfigSchema).min(1).max(8),
});

export type LlmSelection = z.infer<typeof llmSelectionSchema>;
export type DispatcherConfig = z.infer<typeof dispatcherConfigSchema>;
export type AgentConfig = z.infer<typeof agentConfigSchema>;
export type ConversationMessage = z.infer<typeof conversationMessageSchema>;
export type PlanTask = z.infer<typeof planTaskSchema>;
export type DispatcherPlan = z.infer<typeof dispatcherPlanSchema>;
export type OrchestrationRequest = z.infer<typeof orchestrationRequestSchema>;

export type ProviderExecutionMeta = {
  requestedProvider: ProviderId;
  requestedModel: string;
  effectiveProvider: ProviderId;
  effectiveModel: string;
  mode: "live" | "mock";
  warning?: string;
};

type EventBase = {
  eventId: string;
  runId: string;
  timestamp: string;
};

export type RunStartEvent = EventBase & {
  type: "run-start";
  prompt: string;
  dispatcherId: "dispatcher";
  agentIds: string[];
};

export type NodeStatusEvent = EventBase & {
  type: "node-status";
  nodeId: string;
  status: NodeStatus;
  title: string;
  detail: string;
  input?: string;
  output?: string;
  provider?: ProviderExecutionMeta;
};

export type DispatcherPlanEvent = EventBase & {
  type: "dispatcher-plan";
  nodeId: "dispatcher";
  summary: string;
  tasks: PlanTask[];
  synthesisFocus: string[];
  input: string;
  output: string;
  provider: ProviderExecutionMeta;
};

export type AgentResultEvent = EventBase & {
  type: "agent-result";
  nodeId: string;
  task: PlanTask;
  input: string;
  output: string;
  provider: ProviderExecutionMeta;
};

export type FinalResponseEvent = EventBase & {
  type: "final-response";
  nodeId: "dispatcher";
  response: string;
  input: string;
  output: string;
  provider: ProviderExecutionMeta;
};

export type ProviderWarningEvent = EventBase & {
  type: "provider-warning";
  nodeId: string;
  message: string;
  provider: ProviderExecutionMeta;
};

export type RunCompleteEvent = EventBase & {
  type: "run-complete";
};

export type RunErrorEvent = EventBase & {
  type: "run-error";
  nodeId: string;
  message: string;
};

export type OrchestrationEvent =
  | RunStartEvent
  | NodeStatusEvent
  | DispatcherPlanEvent
  | AgentResultEvent
  | FinalResponseEvent
  | ProviderWarningEvent
  | RunCompleteEvent
  | RunErrorEvent;
