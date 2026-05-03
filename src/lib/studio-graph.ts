import type {
  AgentConfig,
  DispatcherConfig,
  NodeStatus,
  OrchestrationErrorCode,
  OrchestrationEvent,
  PlanTask,
  ProviderExecutionMeta,
} from "@/lib/types";

export type NodeSnapshot = {
  id: string;
  label: string;
  subtitle: string;
  kind: "user" | "dispatcher" | "agent";
  status: NodeStatus;
  provider: string;
  model: string;
  accent: string;
  currentTask: string;
  detail: string;
  latestInput?: string;
  latestOutput?: string;
  capabilities: string[];
  warnings: string[];
  warningCodes: OrchestrationErrorCode[];
  errorCode?: OrchestrationErrorCode;
  providerMeta?: ProviderExecutionMeta;
};

export type TaskSnapshot = {
  id: string;
  title: string;
  objective: string;
  expectedOutput: string;
  agentId: string;
  agentName: string;
  agentAccent: string;
  dependsOn: string[];
  status: NodeStatus;
  detail: string;
  attempt?: number;
  latestInput?: string;
  latestOutput?: string;
};

export type GraphSnapshot = {
  nodeSnapshots: Record<string, NodeSnapshot>;
  tasks: PlanTask[];
  taskSnapshots: Record<string, TaskSnapshot>;
};

function createUserSnapshot(): NodeSnapshot {
  return {
    id: "user",
    label: "User",
    subtitle: "Prompt source",
    kind: "user",
    status: "idle",
    provider: "manual",
    model: "browser",
    accent: "#22c55e",
    currentTask: "Waiting for input",
    detail: "Submit a prompt to start the run.",
    capabilities: [],
    warnings: [],
    warningCodes: [],
  };
}

function createDispatcherSnapshot(dispatcher: DispatcherConfig): NodeSnapshot {
  return {
    id: dispatcher.id,
    label: dispatcher.name,
    subtitle: "Dispatcher",
    kind: "dispatcher",
    status: "idle",
    provider: dispatcher.provider,
    model: dispatcher.model,
    accent: "#38bdf8",
    currentTask: "Ready to route work",
    detail: "Breaks down requests and synthesizes specialist reports.",
    capabilities: [],
    warnings: [],
    warningCodes: [],
  };
}

function createAgentSnapshot(agent: AgentConfig): NodeSnapshot {
  return {
    id: agent.id,
    label: agent.name,
    subtitle: agent.role,
    kind: "agent",
    status: "idle",
    provider: agent.provider,
    model: agent.model,
    accent: agent.accent,
    currentTask: agent.specialty,
    detail: agent.specialty,
    capabilities: agent.capabilities,
    warnings: [],
    warningCodes: [],
  };
}

function createTaskSnapshot(task: PlanTask, agent?: AgentConfig): TaskSnapshot {
  return {
    id: task.id,
    title: task.title,
    objective: task.objective,
    expectedOutput: task.expectedOutput,
    agentId: task.agentId,
    agentName: agent?.name ?? task.agentId,
    agentAccent: agent?.accent ?? "#38bdf8",
    dependsOn: task.dependsOn,
    status: "idle",
    detail: task.objective,
  };
}

export function deriveRunSnapshot(
  dispatcher: DispatcherConfig,
  agents: AgentConfig[],
  events: OrchestrationEvent[],
): GraphSnapshot {
  const nodeSnapshots: Record<string, NodeSnapshot> = {
    user: createUserSnapshot(),
    dispatcher: createDispatcherSnapshot(dispatcher),
  };
  const taskSnapshots: Record<string, TaskSnapshot> = {};
  const agentById = new Map(agents.map((agent) => [agent.id, agent] as const));

  for (const agent of agents) {
    nodeSnapshots[agent.id] = createAgentSnapshot(agent);
  }

  let tasks: PlanTask[] = [];

  for (const event of events) {
    if (event.type === "run-start") {
      nodeSnapshots.user.status = "completed";
      nodeSnapshots.user.currentTask = "Submitted prompt";
      nodeSnapshots.user.detail = "The dispatcher has received the latest request.";
      nodeSnapshots.user.latestOutput = event.prompt;
      continue;
    }

    if (event.type === "node-status") {
      const snapshot = nodeSnapshots[event.nodeId];

      if (!snapshot) {
        continue;
      }

      snapshot.status = event.status;
      snapshot.currentTask = event.title;
      snapshot.detail = event.detail;
      snapshot.errorCode = event.errorCode;
      snapshot.latestInput = event.input;
      snapshot.latestOutput = event.output;
      snapshot.providerMeta = event.provider;

      if (event.taskId) {
        const taskSnapshot = taskSnapshots[event.taskId];

        if (taskSnapshot) {
          taskSnapshot.status = event.status;
          taskSnapshot.detail = event.detail;
          taskSnapshot.attempt = event.attempt;
          taskSnapshot.latestInput = event.input;
          taskSnapshot.latestOutput = event.output ?? taskSnapshot.latestOutput;
        }
      }

      continue;
    }

    if (event.type === "provider-warning") {
      const snapshot = nodeSnapshots[event.nodeId];

      if (!snapshot) {
        continue;
      }

      snapshot.warnings = [...snapshot.warnings, event.message];
      snapshot.warningCodes = event.errorCode
        ? [...snapshot.warningCodes, event.errorCode]
        : snapshot.warningCodes;
      snapshot.providerMeta = event.provider;
      snapshot.provider = event.provider.effectiveProvider;
      snapshot.model = event.provider.effectiveModel;
      continue;
    }

    if (event.type === "task-assignment") {
      const snapshot = nodeSnapshots[event.nodeId];
      const taskSnapshot = taskSnapshots[event.task.id];

      if (!snapshot) {
        continue;
      }

      snapshot.status = "queued";
      snapshot.currentTask = event.task.title;
      snapshot.detail = event.detail;

      if (taskSnapshot) {
        taskSnapshot.status = "queued";
        taskSnapshot.detail = event.detail;
      }

      continue;
    }

    if (event.type === "node-chunk") {
      const snapshot = nodeSnapshots[event.nodeId];

      if (!snapshot) {
        continue;
      }

      snapshot.status = event.phase === "synthesis" ? "synthesizing" : "running";
      snapshot.currentTask = event.title;
      snapshot.detail = event.detail;
      snapshot.latestInput = event.input;
      snapshot.latestOutput = event.aggregate;
      snapshot.providerMeta = event.provider;
      snapshot.provider = event.provider.effectiveProvider;
      snapshot.model = event.provider.effectiveModel;

      if (event.taskId) {
        const taskSnapshot = taskSnapshots[event.taskId];

        if (taskSnapshot) {
          taskSnapshot.status = "running";
          taskSnapshot.detail = event.detail;
          taskSnapshot.attempt = event.attempt;
          taskSnapshot.latestInput = event.input;
          taskSnapshot.latestOutput = event.aggregate;
        }
      }

      continue;
    }

    if (event.type === "dispatcher-plan") {
      const snapshot = nodeSnapshots.dispatcher;
      tasks = event.tasks;
      for (const task of event.tasks) {
        taskSnapshots[task.id] = createTaskSnapshot(task, agentById.get(task.agentId));
      }
      snapshot.status = "queued";
      snapshot.currentTask = "Dispatch complete";
      snapshot.detail = event.summary;
      snapshot.latestInput = event.input;
      snapshot.latestOutput = event.output;
      snapshot.providerMeta = event.provider;
      snapshot.provider = event.provider.effectiveProvider;
      snapshot.model = event.provider.effectiveModel;
      continue;
    }

    if (event.type === "agent-result") {
      const snapshot = nodeSnapshots[event.nodeId];
      const taskSnapshot = taskSnapshots[event.task.id];

      if (!snapshot) {
        continue;
      }

      snapshot.status = "completed";
      snapshot.currentTask = event.task.title;
      snapshot.detail = event.task.objective;
      snapshot.latestInput = event.input;
      snapshot.latestOutput = event.output;
      snapshot.providerMeta = event.provider;
      snapshot.provider = event.provider.effectiveProvider;
      snapshot.model = event.provider.effectiveModel;

      if (taskSnapshot) {
        taskSnapshot.status = "completed";
        taskSnapshot.detail = event.task.objective;
        taskSnapshot.attempt = event.attempt;
        taskSnapshot.latestInput = event.input;
        taskSnapshot.latestOutput = event.output;
      }

      continue;
    }

    if (event.type === "final-response") {
      const snapshot = nodeSnapshots.dispatcher;
      snapshot.status = "completed";
      snapshot.currentTask = "Reply ready";
      snapshot.detail = "Dispatcher completed the final synthesis.";
      snapshot.latestInput = event.input;
      snapshot.latestOutput = event.response;
      snapshot.providerMeta = event.provider;
      snapshot.provider = event.provider.effectiveProvider;
      snapshot.model = event.provider.effectiveModel;
      continue;
    }

    if (event.type === "run-cancelled") {
      const snapshot = nodeSnapshots.dispatcher;
      snapshot.status = "cancelled";
      snapshot.currentTask = "Run cancelled";
      snapshot.detail = event.message;
      snapshot.errorCode = event.errorCode;
      continue;
    }

    if (event.type === "run-error") {
      const snapshot = nodeSnapshots[event.nodeId];

      if (!snapshot) {
        continue;
      }

      snapshot.status = "error";
      snapshot.currentTask = "Run failed";
      snapshot.detail = event.message;
      snapshot.errorCode = event.errorCode;

      for (const taskSnapshot of Object.values(taskSnapshots)) {
        if (taskSnapshot.agentId === event.nodeId && taskSnapshot.status !== "completed") {
          taskSnapshot.status = "error";
          taskSnapshot.detail = event.message;
        }
      }
    }
  }

  return { nodeSnapshots, tasks, taskSnapshots };
}
