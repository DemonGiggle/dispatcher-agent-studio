import { z } from "zod";

export const providerIds = ["mock", "ollama", "openai", "anthropic", "google"] as const;

export type ProviderId = (typeof providerIds)[number];
export const ORCHESTRATION_EVENT_SCHEMA_VERSION = 2;
export type OrchestrationErrorCode =
  | "invalid-json"
  | "invalid-request"
  | "prompt-too-large"
  | "conversation-too-large"
  | "too-many-messages"
  | "duplicate-agent-id"
  | "system-prompt-too-large"
  | "unsupported-model"
  | "provider-auth"
  | "provider-rate-limit"
  | "provider-quota"
  | "provider-timeout"
  | "provider-malformed-response"
  | "provider-service"
  | "duplicate-task-id"
  | "unknown-agent"
  | "unknown-dependency"
  | "plan-cycle"
  | "task-failed"
  | "task-dependency-failed"
  | "run-cancelled"
  | "internal-error";
export type NodeStatus =
  | "idle"
  | "planning"
  | "queued"
  | "running"
  | "synthesizing"
  | "completed"
  | "cancelled"
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
  capabilities: z.array(z.string().min(1)).min(1).max(6).default(["Generalist"]),
  systemPrompt: z.string().min(1),
  accent: z.string().min(1),
  enabled: z.boolean().default(true),
  templateId: z.string().min(1).optional(),
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
  dependsOn: z.array(z.string().min(1)).max(7).default([]),
});

export const dispatcherPlanSchema = z.object({
  summary: z.string().min(1),
  tasks: z.array(planTaskSchema).max(8),
  synthesisFocus: z.array(z.string().min(1)).min(1).max(6),
});

export const orchestrationRuntimeOptionsSchema = z.object({
  maxParallelTasks: z.number().int().min(1).max(4).default(2),
  maxTaskRetries: z.number().int().min(0).max(3).default(1),
  taskTimeoutMs: z.number().int().min(1_000).max(120_000).default(45_000),
  dispatcherTimeoutMs: z
    .number()
    .int()
    .min(1_000)
    .max(120_000)
    .default(45_000),
});

export const orchestrationRequestSchema = z.object({
  prompt: z.string().min(1),
  messages: z.array(conversationMessageSchema).default([]),
  dispatcher: dispatcherConfigSchema,
  agents: z.array(agentConfigSchema).min(1).max(8),
  runtime: orchestrationRuntimeOptionsSchema.default({
    maxParallelTasks: 2,
    maxTaskRetries: 1,
    taskTimeoutMs: 45_000,
    dispatcherTimeoutMs: 45_000,
  }),
});

export type LlmSelection = z.infer<typeof llmSelectionSchema>;
export type DispatcherConfig = z.infer<typeof dispatcherConfigSchema>;
export type AgentConfig = z.infer<typeof agentConfigSchema>;
export type ConversationMessage = z.infer<typeof conversationMessageSchema>;
export type PlanTask = z.infer<typeof planTaskSchema>;
export type DispatcherPlan = z.infer<typeof dispatcherPlanSchema>;
export type OrchestrationRequest = z.infer<typeof orchestrationRequestSchema>;
export type OrchestrationRuntimeOptions = z.infer<
  typeof orchestrationRuntimeOptionsSchema
>;

export type ProviderExecutionMeta = {
  requestedProvider: ProviderId;
  requestedModel: string;
  effectiveProvider: ProviderId;
  effectiveModel: string;
  mode: "live" | "mock";
  warning?: string;
};

type EventBase = {
  schemaVersion: typeof ORCHESTRATION_EVENT_SCHEMA_VERSION;
  eventId: string;
  runId: string;
  timestamp: string;
};

export type NodeExecutionPhase = "planning" | "task" | "synthesis";

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
  errorCode?: OrchestrationErrorCode;
  title: string;
  detail: string;
  taskId?: string;
  attempt?: number;
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

export type TaskAssignmentEvent = EventBase & {
  type: "task-assignment";
  nodeId: string;
  dispatcherId: "dispatcher";
  task: PlanTask;
  detail: string;
};

export type NodeChunkEvent = EventBase & {
  type: "node-chunk";
  nodeId: string;
  phase: NodeExecutionPhase;
  title: string;
  detail: string;
  sequence: number;
  taskId?: string;
  attempt?: number;
  input: string;
  chunk: string;
  aggregate: string;
  provider: ProviderExecutionMeta;
};

export type AgentResultEvent = EventBase & {
  type: "agent-result";
  nodeId: string;
  task: PlanTask;
  attempt: number;
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
  errorCode?: OrchestrationErrorCode;
  message: string;
  provider: ProviderExecutionMeta;
};

export type RunCompleteEvent = EventBase & {
  type: "run-complete";
  nodeId: "dispatcher";
  message: string;
};

export type RunCancelledEvent = EventBase & {
  type: "run-cancelled";
  nodeId: "dispatcher";
  errorCode?: OrchestrationErrorCode;
  message: string;
};

export type RunErrorEvent = EventBase & {
  type: "run-error";
  nodeId: string;
  errorCode?: OrchestrationErrorCode;
  message: string;
};

export type OrchestrationEvent =
  | RunStartEvent
  | NodeStatusEvent
  | DispatcherPlanEvent
  | TaskAssignmentEvent
  | NodeChunkEvent
  | AgentResultEvent
  | FinalResponseEvent
  | ProviderWarningEvent
  | RunCompleteEvent
  | RunCancelledEvent
  | RunErrorEvent;
