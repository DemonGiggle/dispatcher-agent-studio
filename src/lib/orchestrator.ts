import {
  ORCHESTRATION_EVENT_SCHEMA_VERSION,
  dispatcherPlanSchema,
  type AgentConfig,
  type DispatcherPlan,
  type NodeExecutionPhase,
  type NodeStatus,
  type OrchestrationErrorCode,
  type OrchestrationEvent,
  type OrchestrationRequest,
  type OrchestrationRuntimeOptions,
  type PlanTask,
  type ProviderExecutionMeta,
} from "@/lib/types";
import {
  createAbortError,
  generatePlainText,
  generateStructuredObject,
  isAbortError,
  isProviderExecutionError,
} from "@/lib/providers";

type EmitEvent = (event: OrchestrationEvent) => Promise<void>;

type WorkerReport = {
  agent: AgentConfig;
  task: PlanTask;
  output: string;
  attempt: number;
};

type ExecutorPlanResult = {
  plan: DispatcherPlan;
  meta: ProviderExecutionMeta;
};

type ExecutorTextResult = {
  text: string;
  meta: ProviderExecutionMeta;
};

export type OrchestrationExecutor = {
  generatePlan(args: {
    request: OrchestrationRequest;
    prompt: string;
    abortSignal: AbortSignal;
  }): Promise<ExecutorPlanResult>;
  executeTask(args: {
    request: OrchestrationRequest;
    plan: DispatcherPlan;
    task: PlanTask;
    agent: AgentConfig;
    dependencyReports: WorkerReport[];
    prompt: string;
    attempt: number;
    abortSignal: AbortSignal;
    onChunk?: (
      chunk: string,
      aggregate: string,
      meta: ProviderExecutionMeta,
    ) => Promise<void>;
  }): Promise<ExecutorTextResult>;
  synthesize(args: {
    request: OrchestrationRequest;
    plan: DispatcherPlan;
    workerReports: WorkerReport[];
    prompt: string;
    abortSignal: AbortSignal;
    onChunk?: (
      chunk: string,
      aggregate: string,
      meta: ProviderExecutionMeta,
    ) => Promise<void>;
  }): Promise<ExecutorTextResult>;
};

type RunOrchestrationOptions = {
  abortSignal?: AbortSignal;
  executor?: OrchestrationExecutor;
};

const MAX_PROMPT_CHARS = 4_000;
const MAX_MESSAGES = 24;
const MAX_CONVERSATION_CHARS = 16_000;
const MAX_SYSTEM_PROMPT_CHARS = 4_000;

class TaskExecutionError extends Error {
  constructor(
    readonly task: PlanTask,
    readonly agent: AgentConfig,
    readonly attempt: number,
    readonly code: OrchestrationErrorCode,
    readonly causeMessage: string,
  ) {
    super(
      `Task "${task.title}" for ${agent.name} failed on attempt ${attempt}: ${causeMessage}`,
    );
    this.name = "TaskExecutionError";
  }
}

class DependencyExecutionError extends Error {
  constructor(
    readonly task: PlanTask,
    readonly dependencyId: string,
    readonly code: OrchestrationErrorCode,
    message: string,
  ) {
    super(
      `Task "${task.title}" could not start because dependency "${dependencyId}" failed: ${message}`,
    );
    this.name = "DependencyExecutionError";
  }
}

class PlanValidationError extends Error {
  constructor(
    readonly code: OrchestrationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PlanValidationError";
  }
}

class GuardrailError extends Error {
  constructor(
    readonly code: OrchestrationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "GuardrailError";
  }
}

class Semaphore {
  private activeCount = 0;

  private readonly queue: Array<{
    grant: () => void;
    reject: (error: Error) => void;
  }> = [];

  constructor(private readonly limit: number) {}

  async use<T>(signal: AbortSignal, callback: () => Promise<T>): Promise<T> {
    await this.acquire(signal);

    try {
      return await callback();
    } finally {
      this.release();
    }
  }

  private acquire(signal: AbortSignal): Promise<void> {
    if (signal.aborted) {
      return Promise.reject(getAbortReason(signal, "Run cancelled before task start."));
    }

    if (this.activeCount < this.limit) {
      this.activeCount += 1;
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      const entry = {
        grant: () => {
          signal.removeEventListener("abort", onAbort);
          this.activeCount += 1;
          resolve();
        },
        reject,
      };

      const onAbort = () => {
        this.dequeue(entry);
        reject(getAbortReason(signal, "Run cancelled while waiting for execution slot."));
      };

      signal.addEventListener("abort", onAbort, { once: true });
      this.queue.push(entry);
    });
  }

  private release() {
    this.activeCount -= 1;

    const next = this.queue.shift();

    if (next) {
      next.grant();
    }
  }

  private dequeue(entry: { grant: () => void; reject: (error: Error) => void }) {
    const index = this.queue.indexOf(entry);

    if (index >= 0) {
      this.queue.splice(index, 1);
    }
  }
}

function createId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function now(): string {
  return new Date().toISOString();
}

function eventBase(runId: string) {
  return {
    schemaVersion: ORCHESTRATION_EVENT_SCHEMA_VERSION,
    eventId: createId("evt"),
    runId,
    timestamp: now(),
  } as const;
}

function trimBlock(text: string, limit = 1_600): string {
  return text.length <= limit ? text : `${text.slice(0, limit)}…`;
}

function formatConversation(messages: OrchestrationRequest["messages"]): string {
  if (messages.length === 0) {
    return "No prior conversation context.";
  }

  return messages
    .map(
      (message, index) =>
        `${index + 1}. ${message.role.toUpperCase()}\n${message.content}`,
    )
    .join("\n\n");
}

function serializeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string" && error.length > 0) {
    return error;
  }

  return "Unknown orchestration error.";
}

function classifyErrorCode(error: unknown): OrchestrationErrorCode | undefined {
  if (error instanceof GuardrailError || error instanceof PlanValidationError) {
    return error.code;
  }

  if (error instanceof TaskExecutionError || error instanceof DependencyExecutionError) {
    return error.code;
  }

  if (isProviderExecutionError(error)) {
    return error.code;
  }

  if (isAbortError(error)) {
    return "run-cancelled";
  }

  return undefined;
}

function getAbortReason(signal: AbortSignal, fallbackMessage: string): Error {
  if (signal.reason instanceof Error) {
    return signal.reason.name === "AbortError"
      ? signal.reason
      : createAbortError(signal.reason.message);
  }

  if (typeof signal.reason === "string" && signal.reason.length > 0) {
    return createAbortError(signal.reason);
  }

  return createAbortError(fallbackMessage);
}

function throwIfAborted(signal: AbortSignal, message: string) {
  if (signal.aborted) {
    throw getAbortReason(signal, message);
  }
}

function enforceRequestGuardrails(request: OrchestrationRequest) {
  if (request.prompt.length > MAX_PROMPT_CHARS) {
    throw new GuardrailError(
      "prompt-too-large",
      `The latest prompt is too large (${request.prompt.length} characters). Keep it under ${MAX_PROMPT_CHARS} characters.`,
    );
  }

  if (request.messages.length > MAX_MESSAGES) {
    throw new GuardrailError(
      "too-many-messages",
      `The conversation has ${request.messages.length} messages. Keep it to ${MAX_MESSAGES} messages or fewer per run.`,
    );
  }

  const conversationChars = request.messages.reduce(
    (total, message) => total + message.content.length,
    0,
  );

  if (conversationChars > MAX_CONVERSATION_CHARS) {
    throw new GuardrailError(
      "conversation-too-large",
      `The conversation context is too large (${conversationChars} characters). Keep it under ${MAX_CONVERSATION_CHARS} characters.`,
    );
  }

  if (request.dispatcher.systemPrompt.length > MAX_SYSTEM_PROMPT_CHARS) {
    throw new GuardrailError(
      "system-prompt-too-large",
      `The dispatcher system prompt is too large. Keep it under ${MAX_SYSTEM_PROMPT_CHARS} characters.`,
    );
  }

  const uniqueAgentIds = new Set<string>();

  for (const agent of request.agents) {
    if (agent.systemPrompt.length > MAX_SYSTEM_PROMPT_CHARS) {
      throw new GuardrailError(
        "system-prompt-too-large",
        `The system prompt for agent "${agent.name}" is too large. Keep it under ${MAX_SYSTEM_PROMPT_CHARS} characters.`,
      );
    }

    if (uniqueAgentIds.has(agent.id)) {
      throw new GuardrailError(
        "duplicate-agent-id",
        `Duplicate agent id "${agent.id}" detected. Each agent id must be unique.`,
      );
    }

    uniqueAgentIds.add(agent.id);
  }
}

function createRunAbortController(externalSignal?: AbortSignal) {
  const controller = new AbortController();

  if (!externalSignal) {
    return controller;
  }

  if (externalSignal.aborted) {
    controller.abort(
      getAbortReason(externalSignal, "Run cancelled by the client."),
    );
    return controller;
  }

  externalSignal.addEventListener(
    "abort",
    () => {
      controller.abort(
        getAbortReason(externalSignal, "Run cancelled by the client."),
      );
    },
    { once: true },
  );

  return controller;
}

function chooseAgentForTask(
  task: PlanTask,
  agents: AgentConfig[],
  usedAgentIds: Set<string>,
): AgentConfig {
  const byExactId = agents.find(
    (agent) => agent.id === task.agentId && !usedAgentIds.has(agent.id),
  );

  if (byExactId) {
    return byExactId;
  }

  const searchSpace = `${task.title} ${task.objective} ${task.expectedOutput}`.toLowerCase();
  const ranked = agents
    .filter((agent) => !usedAgentIds.has(agent.id))
    .map((agent) => {
      const haystack =
        `${agent.name} ${agent.role} ${agent.specialty} ${agent.capabilities.join(" ")}`.toLowerCase();
      const score = haystack
        .split(/\s+/)
        .filter((token) => token && searchSpace.includes(token)).length;
      return { agent, score };
    })
    .sort((left, right) => right.score - left.score);

  return ranked[0]?.agent ?? agents[0];
}

function heuristicPlan(prompt: string, agents: AgentConfig[]): DispatcherPlan {
  const selectedAgents = agents.slice(0, Math.min(agents.length, 3));

  return {
    summary:
      "Split the request into complementary workstreams so each specialist owns a distinct part of the solution.",
    tasks: selectedAgents.map((agent, index) => ({
      id: `task-${index + 1}`,
      agentId: agent.id,
      title: `${agent.role}: ${agent.name}`,
      objective: `Analyze the user request "${trimBlock(prompt, 180)}" from the perspective of ${agent.specialty}.`,
      expectedOutput: `A concise specialist report focused on ${agent.role.toLowerCase()} decisions, tradeoffs, and recommendations.`,
      dependsOn:
        index === 2
          ? selectedAgents.slice(0, 2).map((_, dependencyIndex) => `task-${dependencyIndex + 1}`)
          : [],
    })),
    synthesisFocus: [
      "Highlight how the specialist outputs fit together.",
      "Resolve any tradeoffs between UX, technical design, and scope.",
      "Return an answer that the user can act on immediately.",
    ],
  };
}

function normalizePlan(
  plan: DispatcherPlan,
  agents: AgentConfig[],
  prompt: string,
): DispatcherPlan {
  if (plan.tasks.length === 0) {
    return heuristicPlan(prompt, agents);
  }

  const rawTaskIds = plan.tasks.map((task, index) => task.id || `task-${index + 1}`);
  const usedAgentIds = new Set<string>();
  const normalizedTasks = plan.tasks.map((task, index) => {
    const assignedAgent = chooseAgentForTask(task, agents, usedAgentIds);
    usedAgentIds.add(assignedAgent.id);

    return {
      ...task,
      id: task.id || `task-${index + 1}`,
      agentId: assignedAgent.id,
      title: task.title || `${assignedAgent.role} workstream`,
      objective:
        task.objective ||
        `Analyze the request from the perspective of ${assignedAgent.specialty}.`,
      expectedOutput:
        task.expectedOutput ||
        "A focused report that the dispatcher can synthesize into the final answer.",
      dependsOn: task.dependsOn ?? [],
      _rawTaskId: rawTaskIds[index],
    };
  });

  const taskIdMap = new Map(
    normalizedTasks.map((task) => [task._rawTaskId, task.id] as const),
  );

  const cleanedTasks: PlanTask[] = normalizedTasks.map((task) => ({
    id: task.id,
    agentId: task.agentId,
    title: task.title,
    objective: task.objective,
    expectedOutput: task.expectedOutput,
    dependsOn: [...new Set(task.dependsOn)]
      .map((dependencyId) => taskIdMap.get(dependencyId) ?? dependencyId)
      .filter((dependencyId) => dependencyId !== task.id),
  }));

  const normalizedPlan = {
    summary: plan.summary || "Create a coordinated multi-agent execution plan.",
    tasks: cleanedTasks,
    synthesisFocus:
      plan.synthesisFocus.length > 0
        ? plan.synthesisFocus
        : ["Merge the agent reports into one coherent answer."],
  };

  assertPlanIsExecutable(normalizedPlan, agents);
  return normalizedPlan;
}

function assertPlanIsExecutable(plan: DispatcherPlan, agents: AgentConfig[]) {
  const taskIds = new Set<string>();
  const taskById = new Map(plan.tasks.map((task) => [task.id, task] as const));
  const agentIds = new Set(agents.map((agent) => agent.id));

  for (const task of plan.tasks) {
    if (taskIds.has(task.id)) {
      throw new PlanValidationError(
        "duplicate-task-id",
        `Duplicate task id "${task.id}" in dispatcher plan.`,
      );
    }

    taskIds.add(task.id);

    if (!agentIds.has(task.agentId)) {
      throw new PlanValidationError(
        "unknown-agent",
        `Dispatcher assigned task "${task.title}" to unknown agent "${task.agentId}".`,
      );
    }

    for (const dependencyId of task.dependsOn) {
      if (!taskById.has(dependencyId)) {
        throw new PlanValidationError(
          "unknown-dependency",
          `Task "${task.title}" depends on unknown task "${dependencyId}".`,
        );
      }
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(taskId: string) {
    if (visited.has(taskId)) {
      return;
    }

    if (visiting.has(taskId)) {
      throw new PlanValidationError(
        "plan-cycle",
        `Dispatcher plan contains a dependency cycle involving "${taskId}".`,
      );
    }

    visiting.add(taskId);

    for (const dependencyId of taskById.get(taskId)?.dependsOn ?? []) {
      visit(dependencyId);
    }

    visiting.delete(taskId);
    visited.add(taskId);
  }

  for (const task of plan.tasks) {
    visit(task.id);
  }
}

function buildPlanningPrompt(
  request: OrchestrationRequest,
  agentRoster: string,
): string {
  return [
    "You are dispatching the user's latest request across specialist agents.",
    "Return a plan that uses only the provided agent IDs.",
    `Use at most ${request.agents.length} tasks and avoid duplicate agent assignments unless the request clearly requires it.`,
    "",
    "Available agents:",
    agentRoster,
    "",
    "Conversation context:",
    formatConversation(request.messages),
    "",
    "Latest user request:",
    request.prompt,
    "",
    "Plan requirements:",
    "- Each task must have one exact agentId from the roster.",
    "- Use dependsOn only when a task truly needs an earlier task's output.",
    "- dependsOn must reference task ids from this plan.",
    "- Keep task scopes non-overlapping.",
    "- Give each task a clear objective and expected output.",
    "- Add synthesisFocus bullets to help the dispatcher write the final reply.",
  ].join("\n");
}

function buildAgentPrompt(
  request: OrchestrationRequest,
  task: PlanTask,
  plan: DispatcherPlan,
  agent: AgentConfig,
  dependencyReports: WorkerReport[],
): string {
  const dependencySection =
    dependencyReports.length === 0
      ? "No dependency reports were required before this task."
      : dependencyReports
          .map(
            ({ agent: dependencyAgent, task: dependencyTask, output }, index) =>
              `${index + 1}. ${dependencyTask.id} · ${dependencyTask.title} · ${dependencyAgent.name}\n${output}`,
          )
          .join("\n\n");

  return [
    `You are ${agent.name}, a ${agent.role} specialist.`,
    `Specialty: ${agent.specialty}`,
    `Capabilities: ${agent.capabilities.join(", ")}`,
    "",
    "Dispatcher plan summary:",
    plan.summary,
    "",
    "Assigned task:",
    `- Task id: ${task.id}`,
    `- Title: ${task.title}`,
    `- Objective: ${task.objective}`,
    `- Expected output: ${task.expectedOutput}`,
    `- Dependencies: ${task.dependsOn.length === 0 ? "none" : task.dependsOn.join(", ")}`,
    "",
    "Dependency reports:",
    dependencySection,
    "",
    "Conversation context:",
    formatConversation(request.messages),
    "",
    "Latest user request:",
    request.prompt,
    "",
    "Reply with a crisp specialist report that includes:",
    "1. Your interpretation of the task",
    "2. Key decisions or recommendations",
    "3. Risks, assumptions, or follow-up notes",
  ].join("\n");
}

function buildSynthesisPrompt(
  request: OrchestrationRequest,
  plan: DispatcherPlan,
  workerReports: WorkerReport[],
): string {
  const formattedReports = workerReports
    .map(
      ({ agent, task, output }, index) =>
        `${index + 1}. ${agent.name} (${agent.role})\nTask: ${task.id} · ${task.title}\nDepends on: ${task.dependsOn.length === 0 ? "none" : task.dependsOn.join(", ")}\nReport:\n${output}`,
    )
    .join("\n\n");

  return [
    "You are the dispatcher writing the final answer to the user.",
    "Synthesize the worker outputs into one coherent response.",
    "Do not expose internal chain-of-thought; summarize decisions and tradeoffs clearly.",
    "",
    "Latest user request:",
    request.prompt,
    "",
    "Conversation context:",
    formatConversation(request.messages),
    "",
    "Dispatcher plan summary:",
    plan.summary,
    "",
    "Synthesis focus:",
    plan.synthesisFocus.map((item) => `- ${item}`).join("\n"),
    "",
    "Worker reports:",
    formattedReports,
  ].join("\n");
}

function mockAgentResponse(
  request: OrchestrationRequest,
  task: PlanTask,
  agent: AgentConfig,
  dependencyReports: WorkerReport[],
): string {
  return [
    `${agent.name} reviewed the request with a ${agent.role.toLowerCase()} lens.`,
    "",
    `Task focus: ${task.title}`,
    `Interpretation: ${task.objective}`,
    dependencyReports.length > 0
      ? `Referenced dependency reports: ${dependencyReports.map((report) => report.task.id).join(", ")}`
      : "Referenced dependency reports: none",
    "",
    "Recommendations:",
    `- Anchor the solution around ${agent.specialty.toLowerCase()}.`,
    `- Shape the output so the dispatcher can explain it clearly to the user.`,
    `- Keep the deliverable aligned with: ${trimBlock(request.prompt, 220)}`,
    "",
    "Risks and notes:",
    "- Watch for overlap with adjacent specialists and resolve tradeoffs during synthesis.",
    "- Make assumptions explicit instead of burying them in implementation details.",
  ].join("\n");
}

function mockDispatcherResponse(
  request: OrchestrationRequest,
  plan: DispatcherPlan,
  reports: WorkerReport[],
): string {
  const sections = reports
    .map(
      ({ agent, task }) =>
        `- **${agent.name}** covered **${task.title}** (depends on: ${task.dependsOn.length === 0 ? "none" : task.dependsOn.join(", ")}) and contributed ${agent.specialty.toLowerCase()}.`,
    )
    .join("\n");

  return [
    `針對「${request.prompt}」，dispatcher 已經把工作切給 ${reports.length} 位 specialist，並整合成一致的方案。`,
    "",
    `**拆解策略**：${plan.summary}`,
    "",
    sections,
    "",
    "**整合結論**：",
    "1. 先明確定義使用者要完成的核心目標與成功條件。",
    "2. 再把系統流程、資訊架構與 UI 狀態對齊，避免各 agent 的輸出彼此衝突。",
    "3. 最終回覆應該同時交代範圍、流程、風險與下一步，讓使用者可以直接採納。",
  ].join("\n");
}

function createDefaultExecutor(
  runtime: OrchestrationRuntimeOptions,
): OrchestrationExecutor {
  return {
    async generatePlan({ request, prompt, abortSignal }) {
      const result = await generateStructuredObject({
        selection: request.dispatcher,
        system: request.dispatcher.systemPrompt,
        prompt,
        schema: dispatcherPlanSchema,
        schemaName: "dispatcherPlan",
        abortSignal,
        timeoutMs: runtime.dispatcherTimeoutMs,
        mock: () => heuristicPlan(request.prompt, request.agents),
      });

      return { plan: result.object, meta: result.meta };
    },
    async executeTask({
      request,
      task,
      agent,
      dependencyReports,
      prompt,
      abortSignal,
      onChunk,
    }) {
      const result = await generatePlainText({
        selection: agent,
        system: agent.systemPrompt,
        prompt,
        abortSignal,
        timeoutMs: runtime.taskTimeoutMs,
        mock: () => mockAgentResponse(request, task, agent, dependencyReports),
        onChunk,
      });

      return {
        text: result.text,
        meta: result.meta,
      };
    },
    async synthesize({
      request,
      plan,
      workerReports,
      prompt,
      abortSignal,
      onChunk,
    }) {
      const result = await generatePlainText({
        selection: request.dispatcher,
        system: request.dispatcher.systemPrompt,
        prompt,
        abortSignal,
        timeoutMs: runtime.dispatcherTimeoutMs,
        mock: () => mockDispatcherResponse(request, plan, workerReports),
        onChunk,
      });

      return {
        text: result.text,
        meta: result.meta,
      };
    },
  };
}

async function emitNodeStatus(
  emit: EmitEvent,
  runId: string,
  nodeId: string,
  status: NodeStatus,
  title: string,
  detail: string,
  options: {
    errorCode?: OrchestrationErrorCode;
    taskId?: string;
    attempt?: number;
    input?: string;
    output?: string;
    provider?: ProviderExecutionMeta;
  } = {},
) {
  await emit({
    ...eventBase(runId),
    type: "node-status",
    nodeId,
    status,
    errorCode: options.errorCode,
    title,
    detail,
    taskId: options.taskId,
    attempt: options.attempt,
    input: options.input,
    output: options.output,
    provider: options.provider,
  });
}

async function emitProviderWarning(
  emit: EmitEvent,
  runId: string,
  nodeId: string,
  meta: ProviderExecutionMeta,
  errorCode?: OrchestrationErrorCode,
) {
  if (!meta.warning) {
    return;
  }

  await emit({
    ...eventBase(runId),
    type: "provider-warning",
    nodeId,
    errorCode,
    message: meta.warning,
    provider: meta,
  });
}

async function emitTaskAssignment(
  emit: EmitEvent,
  runId: string,
  task: PlanTask,
) {
  await emit({
    ...eventBase(runId),
    type: "task-assignment",
    nodeId: task.agentId,
    dispatcherId: "dispatcher",
    task,
    detail:
      task.dependsOn.length === 0
        ? "Dispatcher assigned this task and it is ready to run."
        : `Dispatcher assigned this task. Waiting on: ${task.dependsOn.join(", ")}.`,
  });
}

async function emitNodeChunk(
  emit: EmitEvent,
  runId: string,
  nodeId: string,
  phase: NodeExecutionPhase,
  title: string,
  detail: string,
  sequence: number,
  input: string,
  chunk: string,
  aggregate: string,
  provider: ProviderExecutionMeta,
  options: {
    taskId?: string;
    attempt?: number;
  } = {},
) {
  await emit({
    ...eventBase(runId),
    type: "node-chunk",
    nodeId,
    phase,
    title,
    detail,
    sequence,
    taskId: options.taskId,
    attempt: options.attempt,
    input,
    chunk,
    aggregate,
    provider,
  });
}

export async function runOrchestration(
  request: OrchestrationRequest,
  emit: EmitEvent,
  options: RunOrchestrationOptions = {},
): Promise<string | undefined> {
  const runId = createId("run");
  const runtime = request.runtime;
  const executor = options.executor ?? createDefaultExecutor(runtime);
  const runController = createRunAbortController(options.abortSignal);
  const runSignal = runController.signal;
  const taskTerminalStates = new Set<string>();
  const agentById = new Map(request.agents.map((agent) => [agent.id, agent] as const));

  try {
    enforceRequestGuardrails(request);

    const agentRoster = request.agents
      .map(
        (agent) =>
          `- id=${agent.id}; name=${agent.name}; role=${agent.role}; specialty=${agent.specialty}; capabilities=${agent.capabilities.join(", ")}; provider=${agent.provider}; model=${agent.model}`,
      )
      .join("\n");

    await emit({
      ...eventBase(runId),
      type: "run-start",
      prompt: request.prompt,
      dispatcherId: "dispatcher",
      agentIds: request.agents.map((agent) => agent.id),
    });

    const planningInput = buildPlanningPrompt(request, agentRoster);

    await emitNodeStatus(
      emit,
      runId,
      "dispatcher",
      "planning",
      "Planning work split",
      "Dispatcher is decomposing the request and assigning specialists.",
      { input: planningInput },
    );

    const planningResult = await executor.generatePlan({
      request,
      prompt: planningInput,
      abortSignal: runSignal,
    });

    await emitProviderWarning(emit, runId, "dispatcher", planningResult.meta);

    const plan = normalizePlan(planningResult.plan, request.agents, request.prompt);

    await emit({
      ...eventBase(runId),
      type: "dispatcher-plan",
      nodeId: "dispatcher",
      summary: plan.summary,
      tasks: plan.tasks,
      synthesisFocus: plan.synthesisFocus,
      input: planningInput,
      output: JSON.stringify(plan, null, 2),
      provider: planningResult.meta,
    });

    for (const task of plan.tasks) {
      await emitTaskAssignment(emit, runId, task);
    }

    const semaphore = new Semaphore(runtime.maxParallelTasks);
    const taskPromises = new Map<string, Promise<WorkerReport>>();
    const markCancelledIfNeeded = async (
      task: PlanTask,
      detail: string,
      agentId = task.agentId,
    ) => {
      if (taskTerminalStates.has(task.id)) {
        return;
      }

      taskTerminalStates.add(task.id);
      await emitNodeStatus(
        emit,
        runId,
        agentId,
        "cancelled",
        task.title,
        detail,
        { taskId: task.id },
      );
    };

    const runTask = async (task: PlanTask): Promise<WorkerReport> => {
      const agent = agentById.get(task.agentId);

      if (!agent) {
        throw new PlanValidationError(
          "unknown-agent",
          `Task "${task.title}" resolved to missing agent "${task.agentId}".`,
        );
      }

      try {
        const dependencyReports: WorkerReport[] = [];

        for (const dependencyId of task.dependsOn) {
          try {
            dependencyReports.push(await taskPromises.get(dependencyId)!);
          } catch (error) {
            if (isAbortError(error)) {
              await markCancelledIfNeeded(
                task,
                `Cancelled before execution: ${serializeError(error)}`,
              );
              throw error;
            }

            const dependencyError = new DependencyExecutionError(
              task,
              dependencyId,
              "task-dependency-failed",
              serializeError(error),
            );
            await markCancelledIfNeeded(task, dependencyError.message);
            throw dependencyError;
          }
        }

        throwIfAborted(runSignal, `Run cancelled before starting task "${task.title}".`);

        const agentInput = buildAgentPrompt(
          request,
          task,
          plan,
          agent,
          dependencyReports,
        );

        await emitNodeStatus(
          emit,
          runId,
          agent.id,
          "queued",
          task.title,
          task.dependsOn.length === 0
            ? "Task is ready and waiting for an execution slot."
            : `Dependencies satisfied (${task.dependsOn.join(", ")}). Waiting for an execution slot.`,
          {
            taskId: task.id,
            input: agentInput,
          },
        );

        const maxAttempts = runtime.maxTaskRetries + 1;
        let lastError: unknown;

        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          throwIfAborted(
            runSignal,
            `Run cancelled while preparing task "${task.title}".`,
          );

          let lastStreamedOutput = "";
          let chunkSequence = 0;

          try {
            const result = await semaphore.use(runSignal, async () => {
              await emitNodeStatus(
                emit,
                runId,
                agent.id,
                "running",
                task.title,
                attempt === 1
                  ? `${agent.name} is executing the assigned task.`
                  : `${agent.name} is retrying after a previous failure.`,
                {
                  taskId: task.id,
                  attempt,
                  input: agentInput,
                },
              );

              return executor.executeTask({
                request,
                plan,
                task,
                agent,
                dependencyReports,
                prompt: agentInput,
                attempt,
                abortSignal: runSignal,
                onChunk: async (chunk, aggregate, meta) => {
                  chunkSequence += 1;
                  lastStreamedOutput = aggregate;
                  await emitNodeChunk(
                    emit,
                    runId,
                    agent.id,
                    "task",
                    task.title,
                    `${agent.name} is streaming a specialist report.`,
                    chunkSequence,
                    agentInput,
                    chunk,
                    aggregate,
                    meta,
                    {
                      taskId: task.id,
                      attempt,
                    },
                  );
                },
              });
            });

            await emitProviderWarning(emit, runId, agent.id, result.meta);

            const report = {
              agent,
              task,
              output: result.text,
              attempt,
            };

            taskTerminalStates.add(task.id);

            await emit({
              ...eventBase(runId),
              type: "agent-result",
              nodeId: agent.id,
              task,
              attempt,
              input: agentInput,
              output: result.text,
              provider: result.meta,
            });

            return report;
          } catch (error) {
            if (isAbortError(error)) {
              await markCancelledIfNeeded(
                task,
                `Execution stopped: ${serializeError(error)}`,
                agent.id,
              );
              throw error;
            }

            lastError = error;

            if (attempt < maxAttempts) {
              await emitNodeStatus(
                emit,
                runId,
                agent.id,
                "queued",
                task.title,
                `Attempt ${attempt} failed. Retrying (${attempt + 1}/${maxAttempts}).`,
                {
                  taskId: task.id,
                  attempt,
                  output: lastStreamedOutput || serializeError(error),
                },
              );
              continue;
            }
          }
        }

        const taskError = new TaskExecutionError(
          task,
          agent,
          runtime.maxTaskRetries + 1,
          classifyErrorCode(lastError) ?? "task-failed",
          serializeError(lastError),
        );

        taskTerminalStates.add(task.id);
        await emitNodeStatus(
          emit,
          runId,
          agent.id,
          "error",
          task.title,
          taskError.message,
          {
            errorCode: taskError.code,
            taskId: task.id,
            attempt: runtime.maxTaskRetries + 1,
            output: taskError.causeMessage,
          },
        );

        runController.abort(createAbortError(taskError.message));
        throw taskError;
      } catch (error) {
        throw error;
      }
    };

    for (const task of plan.tasks) {
      taskPromises.set(task.id, runTask(task));
    }

    let workerReports: WorkerReport[];

    try {
      workerReports = await Promise.all(plan.tasks.map((task) => taskPromises.get(task.id)!));
    } catch (error) {
      await Promise.allSettled(Array.from(taskPromises.values()));
      throw error;
    }

    const synthesisInput = buildSynthesisPrompt(request, plan, workerReports);

    await emitNodeStatus(
      emit,
      runId,
      "dispatcher",
      "synthesizing",
      "Synthesizing final answer",
      "Dispatcher is merging worker reports into one reply.",
      { input: synthesisInput },
    );

    let synthesisChunkSequence = 0;
    const synthesisResult = await executor.synthesize({
      request,
      plan,
      workerReports,
      prompt: synthesisInput,
      abortSignal: runSignal,
      onChunk: async (chunk, aggregate, meta) => {
        synthesisChunkSequence += 1;
        await emitNodeChunk(
          emit,
          runId,
          "dispatcher",
          "synthesis",
          "Synthesizing final answer",
          "Dispatcher is streaming the merged response.",
          synthesisChunkSequence,
          synthesisInput,
          chunk,
          aggregate,
          meta,
        );
      },
    });

    await emitProviderWarning(emit, runId, "dispatcher", synthesisResult.meta);

    await emit({
      ...eventBase(runId),
      type: "final-response",
      nodeId: "dispatcher",
      response: synthesisResult.text,
      input: synthesisInput,
      output: synthesisResult.text,
      provider: synthesisResult.meta,
    });

    await emit({
      ...eventBase(runId),
      type: "run-complete",
      nodeId: "dispatcher",
      message: "All orchestration steps completed successfully.",
    });

    return synthesisResult.text;
  } catch (error) {
    if (isAbortError(error)) {
      const message = serializeError(error);

      await emitNodeStatus(
        emit,
        runId,
        "dispatcher",
        "cancelled",
        "Run cancelled",
        message,
        { errorCode: "run-cancelled" },
      );

      await emit({
        ...eventBase(runId),
        type: "run-cancelled",
        nodeId: "dispatcher",
        errorCode: "run-cancelled",
        message,
      });

      return undefined;
    }

    const message = serializeError(error);
    const errorCode = classifyErrorCode(error) ?? "internal-error";
    const nodeId =
      error instanceof TaskExecutionError
        ? error.agent.id
        : error instanceof DependencyExecutionError
          ? error.task.agentId
          : "dispatcher";

    await emitNodeStatus(
      emit,
      runId,
      "dispatcher",
      "error",
      "Run failed",
      message,
      { errorCode },
    );

    await emit({
      ...eventBase(runId),
      type: "run-error",
      nodeId,
      errorCode,
      message,
    });

    return undefined;
  }
}
