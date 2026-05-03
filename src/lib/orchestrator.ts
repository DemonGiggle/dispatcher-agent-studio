import {
  dispatcherPlanSchema,
  type AgentConfig,
  type ConversationMessage,
  type DispatcherPlan,
  type OrchestrationEvent,
  type OrchestrationRequest,
  type PlanTask,
  type ProviderExecutionMeta,
} from "@/lib/types";
import {
  generatePlainText,
  generateStructuredObject,
} from "@/lib/providers";

type EmitEvent = (event: OrchestrationEvent) => Promise<void>;

function createId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function now(): string {
  return new Date().toISOString();
}

function trimBlock(text: string, limit = 1_600): string {
  return text.length <= limit ? text : `${text.slice(0, limit)}…`;
}

function formatConversation(messages: ConversationMessage[]): string {
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
    })),
    synthesisFocus: [
      "Highlight how the specialist outputs fit together.",
      "Resolve any tradeoffs between UX, technical design, and scope.",
      "Return an answer that the user can act on immediately.",
    ],
  };
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
      const haystack = `${agent.name} ${agent.role} ${agent.specialty}`.toLowerCase();
      const score = haystack
        .split(/\s+/)
        .filter((token) => token && searchSpace.includes(token)).length;
      return { agent, score };
    })
    .sort((left, right) => right.score - left.score);

  return ranked[0]?.agent ?? agents[0];
}

function normalizePlan(
  plan: DispatcherPlan,
  agents: AgentConfig[],
  prompt: string,
): DispatcherPlan {
  if (plan.tasks.length === 0) {
    return heuristicPlan(prompt, agents);
  }

  const usedAgentIds = new Set<string>();
  const normalizedTasks: PlanTask[] = [];

  for (const [index, task] of plan.tasks.entries()) {
    if (usedAgentIds.size >= agents.length) {
      break;
    }

    const assignedAgent = chooseAgentForTask(task, agents, usedAgentIds);
    usedAgentIds.add(assignedAgent.id);

    normalizedTasks.push({
      id: task.id || `task-${index + 1}`,
      agentId: assignedAgent.id,
      title: task.title || `${assignedAgent.role} workstream`,
      objective:
        task.objective ||
        `Analyze the request from the perspective of ${assignedAgent.specialty}.`,
      expectedOutput:
        task.expectedOutput ||
        `A focused report that the dispatcher can synthesize into the final answer.`,
    });
  }

  if (normalizedTasks.length === 0) {
    return heuristicPlan(prompt, agents);
  }

  return {
    summary: plan.summary || "Create a coordinated multi-agent execution plan.",
    tasks: normalizedTasks,
    synthesisFocus:
      plan.synthesisFocus.length > 0
        ? plan.synthesisFocus
        : ["Merge the agent reports into one coherent answer."],
  };
}

function buildPlanningPrompt(
  request: OrchestrationRequest,
  agentRoster: string,
): string {
  return [
    "You are dispatching the user's latest request across specialist agents.",
    "Return a plan that uses only the provided agent IDs.",
    `Use at most ${request.agents.length} tasks and avoid duplicate agent assignments.`,
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
): string {
  return [
    `You are ${agent.name}, a ${agent.role} specialist.`,
    `Specialty: ${agent.specialty}`,
    "",
    "Dispatcher plan summary:",
    plan.summary,
    "",
    "Assigned task:",
    `- Title: ${task.title}`,
    `- Objective: ${task.objective}`,
    `- Expected output: ${task.expectedOutput}`,
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
  workerReports: Array<{ agent: AgentConfig; task: PlanTask; output: string }>,
): string {
  const formattedReports = workerReports
    .map(
      ({ agent, task, output }, index) =>
        `${index + 1}. ${agent.name} (${agent.role})\nTask: ${task.title}\nReport:\n${output}`,
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
): string {
  return [
    `${agent.name} reviewed the request with a ${agent.role.toLowerCase()} lens.`,
    "",
    `Task focus: ${task.title}`,
    `Interpretation: ${task.objective}`,
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
  reports: Array<{ agent: AgentConfig; task: PlanTask; output: string }>,
): string {
  const sections = reports
    .map(
      ({ agent, task }) =>
        `- **${agent.name}** covered **${task.title}** and contributed ${agent.specialty.toLowerCase()}.`,
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

async function emitNodeStatus(
  emit: EmitEvent,
  runId: string,
  nodeId: string,
  status: OrchestrationEvent extends infer T
    ? T extends { type: "node-status"; status: infer S }
      ? S
      : never
    : never,
  title: string,
  detail: string,
  input?: string,
  output?: string,
  provider?: ProviderExecutionMeta,
) {
  await emit({
    type: "node-status",
    eventId: createId("evt"),
    runId,
    timestamp: now(),
    nodeId,
    status,
    title,
    detail,
    input,
    output,
    provider,
  });
}

export async function runOrchestration(
  request: OrchestrationRequest,
  emit: EmitEvent,
): Promise<string> {
  const runId = createId("run");
  const agentRoster = request.agents
    .map(
      (agent) =>
        `- id=${agent.id}; name=${agent.name}; role=${agent.role}; specialty=${agent.specialty}; provider=${agent.provider}; model=${agent.model}`,
    )
    .join("\n");

  await emit({
    type: "run-start",
    eventId: createId("evt"),
    runId,
    timestamp: now(),
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
    planningInput,
  );

  const planningResult = await generateStructuredObject({
    selection: request.dispatcher,
    system: request.dispatcher.systemPrompt,
    prompt: planningInput,
    schema: dispatcherPlanSchema,
    schemaName: "dispatcherPlan",
    mock: () => heuristicPlan(request.prompt, request.agents),
  });

  if (planningResult.meta.warning) {
    await emit({
      type: "provider-warning",
      eventId: createId("evt"),
      runId,
      timestamp: now(),
      nodeId: "dispatcher",
      message: planningResult.meta.warning,
      provider: planningResult.meta,
    });
  }

  const plan = normalizePlan(planningResult.object, request.agents, request.prompt);

  await emit({
    type: "dispatcher-plan",
    eventId: createId("evt"),
    runId,
    timestamp: now(),
    nodeId: "dispatcher",
    summary: plan.summary,
    tasks: plan.tasks,
    synthesisFocus: plan.synthesisFocus,
    input: planningInput,
    output: JSON.stringify(plan, null, 2),
    provider: planningResult.meta,
  });

  const workerReports = await Promise.all(
    plan.tasks.map(async (task) => {
      const agent = request.agents.find((candidate) => candidate.id === task.agentId);

      if (!agent) {
        throw new Error(`Unknown agent assignment: ${task.agentId}`);
      }

      const agentInput = buildAgentPrompt(request, task, plan, agent);

      await emitNodeStatus(
        emit,
        runId,
        agent.id,
        "running",
        task.title,
        `${agent.name} is working on the assigned task.`,
        agentInput,
      );

      const result = await generatePlainText({
        selection: agent,
        system: agent.systemPrompt,
        prompt: agentInput,
        mock: () => mockAgentResponse(request, task, agent),
      });

      if (result.meta.warning) {
        await emit({
          type: "provider-warning",
          eventId: createId("evt"),
          runId,
          timestamp: now(),
          nodeId: agent.id,
          message: result.meta.warning,
          provider: result.meta,
        });
      }

      await emit({
        type: "agent-result",
        eventId: createId("evt"),
        runId,
        timestamp: now(),
        nodeId: agent.id,
        task,
        input: agentInput,
        output: result.text,
        provider: result.meta,
      });

      return { agent, task, output: result.text };
    }),
  );

  const synthesisInput = buildSynthesisPrompt(request, plan, workerReports);

  await emitNodeStatus(
    emit,
    runId,
    "dispatcher",
    "synthesizing",
    "Synthesizing final answer",
    "Dispatcher is merging worker reports into one reply.",
    synthesisInput,
  );

  const synthesisResult = await generatePlainText({
    selection: request.dispatcher,
    system: request.dispatcher.systemPrompt,
    prompt: synthesisInput,
    mock: () => mockDispatcherResponse(request, plan, workerReports),
  });

  if (synthesisResult.meta.warning) {
    await emit({
      type: "provider-warning",
      eventId: createId("evt"),
      runId,
      timestamp: now(),
      nodeId: "dispatcher",
      message: synthesisResult.meta.warning,
      provider: synthesisResult.meta,
    });
  }

  await emit({
    type: "final-response",
    eventId: createId("evt"),
    runId,
    timestamp: now(),
    nodeId: "dispatcher",
    response: synthesisResult.text,
    input: synthesisInput,
    output: synthesisResult.text,
    provider: synthesisResult.meta,
  });

  await emit({
    type: "run-complete",
    eventId: createId("evt"),
    runId,
    timestamp: now(),
  });

  return synthesisResult.text;
}
