import type {
  AgentConfig,
  DispatcherConfig,
  OrchestrationEvent,
  PlanTask,
  ProviderExecutionMeta,
} from "@/lib/types";

export type NodeSnapshot = {
  id: string;
  label: string;
  subtitle: string;
  kind: "user" | "dispatcher" | "agent";
  status:
    | "idle"
    | "planning"
    | "queued"
    | "running"
    | "synthesizing"
    | "completed"
    | "error";
  provider: string;
  model: string;
  accent: string;
  currentTask: string;
  detail: string;
  latestInput?: string;
  latestOutput?: string;
  warnings: string[];
  providerMeta?: ProviderExecutionMeta;
};

export type GraphSnapshot = {
  nodeSnapshots: Record<string, NodeSnapshot>;
  tasks: PlanTask[];
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
    warnings: [],
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
    warnings: [],
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
    warnings: [],
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
      snapshot.latestInput = event.input;
      snapshot.latestOutput = event.output;
      snapshot.providerMeta = event.provider;
      continue;
    }

    if (event.type === "provider-warning") {
      const snapshot = nodeSnapshots[event.nodeId];

      if (!snapshot) {
        continue;
      }

      snapshot.warnings = [...snapshot.warnings, event.message];
      snapshot.providerMeta = event.provider;
      snapshot.provider = event.provider.effectiveProvider;
      snapshot.model = event.provider.effectiveModel;
      continue;
    }

    if (event.type === "dispatcher-plan") {
      const snapshot = nodeSnapshots.dispatcher;
      tasks = event.tasks;
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

    if (event.type === "run-error") {
      const snapshot = nodeSnapshots[event.nodeId];

      if (!snapshot) {
        continue;
      }

      snapshot.status = "error";
      snapshot.currentTask = "Run failed";
      snapshot.detail = event.message;
    }
  }

  return { nodeSnapshots, tasks };
}
