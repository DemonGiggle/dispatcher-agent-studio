"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Boxes,
  BrainCircuit,
  MessageSquareText,
  Settings2,
  Waypoints,
  Workflow,
} from "lucide-react";

import { ChatPanel } from "@/components/chat-panel";
import { ConfigPanel } from "@/components/config-panel";
import { EventInspector } from "@/components/event-inspector";
import { GraphPanel } from "@/components/graph-panel";
import {
  createBlankAgent,
  createAgentFromTemplate,
  duplicateAgent,
  getEnabledAgents,
  validateAgentTeam,
} from "@/lib/agent-builder";
import {
  cloneAgentConfigs,
  cloneDispatcherConfig,
  cloneRuntimeOptions,
  cloneStarterMessages,
  samplePrompts,
} from "@/lib/defaults";
import {
  getDefaultProviderModelsById,
  getDefaultProviderHealth,
  type ModelCatalogEntry,
  type ProviderHealthEntry,
} from "@/lib/model-catalog";
import {
  cloneAgents,
  cloneDispatcher,
  cloneMessages as clonePersistedMessages,
  deleteTeamRecord,
  loadPersistedStudioState,
  savePersistedStudioState,
  saveRunRecord,
  saveTeamRecord,
  type SavedRunRecord,
  type SavedTeamRecord,
} from "@/lib/studio-persistence";
import {
  createReplaySlice,
  findRunRecord,
  getReplaySelection,
} from "@/lib/run-history";
import { deriveRunSnapshot } from "@/lib/studio-graph";
import type {
  AgentConfig,
  ConversationMessage,
  DispatcherConfig,
  OrchestrationErrorCode,
  OrchestrationEvent,
  OrchestrationRequest,
  OrchestrationRuntimeOptions,
  ProviderId,
} from "@/lib/types";

const accentPalette = ["#38bdf8", "#7c3aed", "#f97316", "#22c55e", "#ec4899"];

type RunAlert = {
  tone: "error" | "warning" | "info";
  title: string;
  detail: string;
  code?: OrchestrationErrorCode;
};

type WorkspaceTabId = "chat" | "inspect" | "setup";

const workspaceTabs: {
  id: WorkspaceTabId;
  label: string;
  description: string;
  icon: typeof MessageSquareText;
}[] = [
  {
    id: "chat",
    label: "Chat",
    description: "Prompt, conversation, and run replay",
    icon: MessageSquareText,
  },
  {
    id: "inspect",
    label: "Inspect",
    description: "Graph and event inspection",
    icon: Workflow,
  },
  {
    id: "setup",
    label: "Setup",
    description: "Dispatcher and agent configuration",
    icon: Settings2,
  },
];

function createId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function cloneMessages(): ConversationMessage[] {
  return cloneStarterMessages();
}

function buildStatusText(event: OrchestrationEvent): string {
  switch (event.type) {
    case "run-start":
      return "Dispatcher received the prompt.";
    case "node-status":
      return event.detail;
    case "dispatcher-plan":
      return "Tasks routed to specialists.";
    case "task-assignment":
      return event.detail;
    case "node-chunk":
      return event.detail;
    case "agent-result":
      return `${event.task.title} completed.`;
    case "final-response":
      return "Final synthesis is ready.";
    case "provider-warning":
      return event.message;
    case "run-complete":
      return event.message;
    case "run-cancelled":
      return event.message;
    case "run-error":
      return event.message;
  }
}

async function streamEvents(
  request: OrchestrationRequest,
  onEvent: (event: OrchestrationEvent) => void,
): Promise<void> {
  const response = await fetch("/api/orchestrate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}.`;

    try {
      const errorPayload = (await response.json()) as {
        error?: string;
        message?: string;
        errorCode?: string;
      };

      message = [errorPayload.error, errorPayload.errorCode, errorPayload.message]
        .filter(Boolean)
        .join(" · ");
    } catch {
      message = await response.text();
    }

    throw new Error(message);
  }

  if (!response.body) {
    throw new Error("Streaming response body is not available.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n");
    buffer = chunks.pop() ?? "";

    for (const chunk of chunks) {
      if (!chunk.trim()) {
        continue;
      }

      onEvent(JSON.parse(chunk) as OrchestrationEvent);
    }
  }

  if (buffer.trim()) {
    onEvent(JSON.parse(buffer) as OrchestrationEvent);
  }
}

export function StudioApp() {
  const [dispatcher, setDispatcher] = useState<DispatcherConfig>(
    cloneDispatcherConfig,
  );
  const [agents, setAgents] = useState<AgentConfig[]>(cloneAgentConfigs);
  const [messages, setMessages] = useState<ConversationMessage[]>(cloneMessages);
  const [events, setEvents] = useState<OrchestrationEvent[]>([]);
  const [runtime] = useState<OrchestrationRuntimeOptions>(cloneRuntimeOptions);
  const [draft, setDraft] = useState(samplePrompts[0] ?? "");
  const [selectedNodeId, setSelectedNodeId] = useState("dispatcher");
  const [selectedTaskId, setSelectedTaskId] = useState<string>();
  const [statusText, setStatusText] = useState("Ready for a new request.");
  const [errorText, setErrorText] = useState<string>();
  const [runAlert, setRunAlert] = useState<RunAlert>();
  const [providerHealthById, setProviderHealthById] = useState<
    Record<ProviderId, ProviderHealthEntry>
  >(getDefaultProviderHealth);
  const [providerModelsById, setProviderModelsById] = useState<
    Record<ProviderId, ModelCatalogEntry[]>
  >(getDefaultProviderModelsById);
  const [isRunning, setIsRunning] = useState(false);
  const [savedTeams, setSavedTeams] = useState<SavedTeamRecord[]>([]);
  const [recentRuns, setRecentRuns] = useState<SavedRunRecord[]>([]);
  const [hasLoadedPersistence, setHasLoadedPersistence] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string>();
  const [replayCursor, setReplayCursor] = useState<number | null>(null);
  const [isReplayPlaying, setIsReplayPlaying] = useState(false);
  const [activeTab, setActiveTab] = useState<WorkspaceTabId>("chat");
  const enabledAgents = useMemo(() => getEnabledAgents(agents), [agents]);
  const teamValidationIssues = useMemo(() => validateAgentTeam(agents), [agents]);
  const activeRun = useMemo(
    () => findRunRecord(recentRuns, activeRunId),
    [activeRunId, recentRuns],
  );
  const displayedEvents = useMemo(
    () =>
      activeRun && replayCursor !== null
        ? createReplaySlice(activeRun.events, replayCursor)
        : events,
    [activeRun, events, replayCursor],
  );
  const displayStatusText =
    activeRun && replayCursor !== null
      ? `Replay ${Math.min(replayCursor, activeRun.events.length)}/${activeRun.events.length} · ${activeRun.title}`
      : statusText;

  const snapshot = useMemo(
    () => deriveRunSnapshot(dispatcher, enabledAgents, displayedEvents),
    [dispatcher, displayedEvents, enabledAgents],
  );

  useEffect(() => {
    const persistedState = loadPersistedStudioState();
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) {
        return;
      }

      if (persistedState.autosavedStudio) {
        setDispatcher(persistedState.autosavedStudio.dispatcher);
        setAgents(persistedState.autosavedStudio.agents);
        setMessages(persistedState.autosavedStudio.messages);
        setDraft(persistedState.autosavedStudio.draft);
      }

      setSavedTeams(persistedState.savedTeams);
      setRecentRuns(persistedState.recentRuns);
      setHasLoadedPersistence(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const response = await fetch("/api/provider-status");

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as {
          providers?: Record<ProviderId, ProviderHealthEntry>;
          providerModels?: Record<ProviderId, ModelCatalogEntry[]>;
        };

        if (active && payload.providers) {
          setProviderHealthById(payload.providers);
        }

        if (active && payload.providerModels) {
          setProviderModelsById(payload.providerModels);
        }
      } catch {
        // Keep the default missing-key state when the status endpoint is unavailable.
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hasLoadedPersistence) {
      return;
    }

    savePersistedStudioState({
      schemaVersion: 1,
      autosavedStudio: {
        dispatcher: cloneDispatcher(dispatcher),
        agents: cloneAgents(agents),
        messages: clonePersistedMessages(messages),
        draft,
      },
      savedTeams,
      recentRuns,
    });
  }, [
    agents,
    dispatcher,
    draft,
    hasLoadedPersistence,
    messages,
    recentRuns,
    savedTeams,
  ]);

  useEffect(() => {
    if (!activeRun || replayCursor === null || !isReplayPlaying) {
      return;
    }

    if (replayCursor >= activeRun.events.length) {
      queueMicrotask(() => {
        setIsReplayPlaying(false);
      });
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setReplayCursor((current) => {
        if (current === null) {
          return current;
        }

        return Math.min(current + 1, activeRun.events.length);
      });
    }, 320);

    return () => window.clearTimeout(timeoutId);
  }, [activeRun, isReplayPlaying, replayCursor]);

  useEffect(() => {
    if (!activeRun || replayCursor === null) {
      return;
    }

    const selection = getReplaySelection(displayedEvents);

    queueMicrotask(() => {
      setSelectedNodeId(selection.nodeId);
      setSelectedTaskId(selection.taskId);
    });
  }, [activeRun, displayedEvents, replayCursor]);

  const handleDispatcherChange = <K extends keyof DispatcherConfig>(
    field: K,
    value: DispatcherConfig[K],
  ) => {
    setDispatcher((current) => ({ ...current, [field]: value }));
  };

  const handleAgentChange = <K extends keyof AgentConfig>(
    agentId: string,
    field: K,
    value: AgentConfig[K],
  ) => {
    setAgents((current) =>
      current.map((agent) =>
        agent.id === agentId ? { ...agent, [field]: value } : agent,
      ),
    );
  };

  const handleAddAgent = () => {
    const nextIndex = agents.length;

    setAgents((current) => [
      ...current,
      createBlankAgent(
        createId("agent"),
        accentPalette[nextIndex % accentPalette.length],
      ),
    ]);
  };

  const handleAddAgentFromTemplate = (templateId: string) => {
    const nextIndex = agents.length;

    setAgents((current) => [
      ...current,
      createAgentFromTemplate(templateId, createId("agent"), {
        accent: accentPalette[nextIndex % accentPalette.length],
      }),
    ]);
  };

  const handleDuplicateAgent = (agentId: string) => {
    setAgents((current) => {
      const index = current.findIndex((agent) => agent.id === agentId);

      if (index < 0) {
        return current;
      }

      const clonedAgent = duplicateAgent(current[index], createId("agent"));
      clonedAgent.accent = accentPalette[current.length % accentPalette.length];

      return [
        ...current.slice(0, index + 1),
        clonedAgent,
        ...current.slice(index + 1),
      ];
    });
  };

  const handleMoveAgent = (agentId: string, direction: "up" | "down") => {
    setAgents((current) => {
      const index = current.findIndex((agent) => agent.id === agentId);

      if (index < 0) {
        return current;
      }

      const targetIndex = direction === "up" ? index - 1 : index + 1;

      if (targetIndex < 0 || targetIndex >= current.length) {
        return current;
      }

      const nextAgents = [...current];
      const [agent] = nextAgents.splice(index, 1);
      nextAgents.splice(targetIndex, 0, agent);
      return nextAgents;
    });
  };

  const handleToggleAgent = (agentId: string) => {
    setAgents((current) =>
      current.map((agent) =>
        agent.id === agentId ? { ...agent, enabled: !agent.enabled } : agent,
      ),
    );

    if (selectedNodeId === agentId) {
      setSelectedNodeId("dispatcher");
      setSelectedTaskId(undefined);
    }
  };

  const handleSaveCurrentTeam = (name: string) => {
    const nextName = name.trim();

    if (!nextName) {
      return;
    }

    const savedAt = new Date().toISOString();
    const matchingTeam = savedTeams.find(
      (team) => team.name.trim().toLowerCase() === nextName.toLowerCase(),
    );

    setSavedTeams((current) =>
      saveTeamRecord(current, {
        id: matchingTeam?.id ?? createId("team"),
        name: nextName,
        savedAt,
        dispatcher: cloneDispatcher(dispatcher),
        agents: cloneAgents(agents),
      }),
    );
    setRunAlert({
      tone: "info",
      title: "Team saved",
      detail: `Saved "${nextName}" for reuse.`,
    });
  };

  const handleLoadSavedTeam = (teamId: string) => {
    const savedTeam = savedTeams.find((team) => team.id === teamId);

    if (!savedTeam) {
      return;
    }

    setDispatcher(savedTeam.dispatcher);
    setAgents(savedTeam.agents);
    setEvents([]);
    setSelectedNodeId("dispatcher");
    setSelectedTaskId(undefined);
    setStatusText(`Loaded team "${savedTeam.name}".`);
    setActiveRunId(undefined);
    setReplayCursor(null);
    setIsReplayPlaying(false);
    setRunAlert({
      tone: "info",
      title: "Team loaded",
      detail: `Restored "${savedTeam.name}" from saved teams.`,
    });
  };

  const handleDeleteSavedTeam = (teamId: string) => {
    const savedTeam = savedTeams.find((team) => team.id === teamId);

    setSavedTeams((current) => deleteTeamRecord(current, teamId));

    if (savedTeam) {
      setRunAlert({
        tone: "info",
        title: "Team deleted",
        detail: `Removed "${savedTeam.name}" from saved teams.`,
      });
    }
  };

  const handleRemoveAgent = (agentId: string) => {
    setAgents((current) =>
      current.length === 1
        ? current
        : current.filter((agent) => agent.id !== agentId),
    );

    if (selectedNodeId === agentId) {
      setSelectedNodeId("dispatcher");
    }
  };

  const handleResetDefaults = () => {
    setDispatcher(cloneDispatcherConfig());
    setAgents(cloneAgentConfigs());
    setMessages(cloneMessages());
    setEvents([]);
    setDraft(samplePrompts[0] ?? "");
    setSelectedNodeId("dispatcher");
    setSelectedTaskId(undefined);
    setStatusText("Ready for a new request.");
    setErrorText(undefined);
    setRunAlert(undefined);
    setIsRunning(false);
    setActiveRunId(undefined);
    setReplayCursor(null);
    setIsReplayPlaying(false);
  };

  const handleSubmit = async () => {
    const prompt = draft.trim();

    if (!prompt || isRunning) {
      return;
    }

    if (teamValidationIssues.length > 0) {
      setRunAlert({
        tone: "error",
        title: "Fix the agent team before running",
        detail: teamValidationIssues.map((issue) => issue.message).join(" "),
      });
      setStatusText("Resolve the team configuration issues first.");
      return;
    }

    const nextMessages: ConversationMessage[] = [
      ...messages,
      {
        id: createId("msg"),
        role: "user",
        content: prompt,
      },
    ];

    setMessages(nextMessages);
    setDraft("");
    setEvents([]);
    setErrorText(undefined);
    setRunAlert(undefined);
    setStatusText("Dispatcher is planning the run...");
    setSelectedNodeId("dispatcher");
    setSelectedTaskId(undefined);
    setIsRunning(true);
    setActiveRunId(undefined);
    setReplayCursor(null);
    setIsReplayPlaying(false);

    let finalResponse: string | undefined;
    let runStatus: SavedRunRecord["status"] = "completed";
    const collectedEvents: OrchestrationEvent[] = [];
    const dispatcherSnapshot = cloneDispatcher(dispatcher);
    const runAgents = cloneAgents(enabledAgents);
    let persistedMessages = clonePersistedMessages(nextMessages);

    try {
      await streamEvents(
        {
          prompt,
          messages: nextMessages,
          dispatcher,
          agents: enabledAgents,
          runtime,
        },
        (event) => {
          collectedEvents.push(event);
          setEvents((current) => [...current, event]);
          setStatusText(buildStatusText(event));

          if (event.type === "task-assignment") {
            setSelectedNodeId(event.nodeId);
            setSelectedTaskId(event.task.id);
          }

          if (event.type === "node-chunk") {
            setSelectedNodeId(event.nodeId);
            setSelectedTaskId(event.taskId);
          }

          if (event.type === "agent-result") {
            setSelectedNodeId(event.nodeId);
            setSelectedTaskId(event.task.id);
          }

          if (event.type === "final-response") {
            finalResponse = event.response;
            setSelectedNodeId("dispatcher");
            setSelectedTaskId(undefined);
          }

          if (event.type === "run-error") {
            runStatus = "error";
            setErrorText(undefined);
            setRunAlert({
              tone: "error",
              title: "Run failed",
              detail: event.message,
              code: event.errorCode,
            });
            setSelectedNodeId(event.nodeId);
            setSelectedTaskId(undefined);
          }

          if (event.type === "run-cancelled") {
            runStatus = "cancelled";
            setRunAlert({
              tone: "info",
              title: "Run cancelled",
              detail: event.message,
              code: event.errorCode,
            });
            setSelectedNodeId("dispatcher");
            setSelectedTaskId(undefined);
          }
        },
      );

      if (finalResponse) {
        const assistantMessage = finalResponse;
        persistedMessages = [
          ...persistedMessages,
          {
            id: createId("msg"),
            role: "assistant",
            content: assistantMessage,
          },
        ];

        setMessages(persistedMessages);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unexpected client error.";
      runStatus = "error";
      setErrorText(undefined);
      setRunAlert({
        tone: "error",
        title: "Request failed",
        detail: message,
      });
      setStatusText(message);
    } finally {
      if (collectedEvents.length > 0) {
        const createdAt = collectedEvents[0]?.timestamp ?? new Date().toISOString();
        const runId = collectedEvents[0]?.runId ?? createId("run");

        setRecentRuns((current) =>
          saveRunRecord(current, {
            id: runId,
            title:
              prompt.length > 72 ? `${prompt.slice(0, 72).trimEnd()}…` : prompt,
            prompt,
            createdAt,
            status: runStatus,
            dispatcher: dispatcherSnapshot,
            agents: runAgents,
            messages: persistedMessages,
            events: collectedEvents,
          }),
        );
        setActiveRunId(runId);
      }

      setIsRunning(false);
    }
  };

  const handleOpenRun = (runId: string) => {
    const run = recentRuns.find((entry) => entry.id === runId);

    if (!run) {
      return;
    }

    setDispatcher(run.dispatcher);
    setAgents(run.agents);
    setMessages(run.messages);
    setEvents(run.events);
    setDraft(run.prompt);
    setSelectedNodeId("dispatcher");
    setSelectedTaskId(undefined);
    setStatusText(`Loaded ${run.status} run from ${new Date(run.createdAt).toLocaleString()}.`);
    setRunAlert({
      tone: "info",
      title: "Run loaded",
      detail: `Reopened "${run.title}" with its conversation and graph state.`,
    });
    setIsRunning(false);
    setActiveRunId(run.id);
    setReplayCursor(null);
    setIsReplayPlaying(false);
  };

  const handleReplaySeek = (nextCursor: number) => {
    if (!activeRun) {
      return;
    }

    const clampedCursor = Math.max(0, Math.min(nextCursor, activeRun.events.length));
    const replayEvents = createReplaySlice(activeRun.events, clampedCursor);
    const selection = getReplaySelection(replayEvents);

    setReplayCursor(clampedCursor);
    setIsReplayPlaying(false);
    setSelectedNodeId(selection.nodeId);
    setSelectedTaskId(selection.taskId);
  };

  const handleReplayToggle = () => {
    if (!activeRun) {
      return;
    }

    if (replayCursor === null || replayCursor >= activeRun.events.length) {
      handleReplaySeek(1);
      setIsReplayPlaying(true);
      return;
    }

    setIsReplayPlaying((current) => !current);
  };

  const handleReplayStop = () => {
    setReplayCursor(null);
    setIsReplayPlaying(false);
    setSelectedNodeId("dispatcher");
    setSelectedTaskId(undefined);
  };

  const focusWorkspaceTarget = (tabId: WorkspaceTabId, targetId: string) => {
    setActiveTab(tabId);

    window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.focus();
    });
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.14),transparent_28%),radial-gradient(circle_at_85%_18%,rgba(124,58,237,0.16),transparent_24%),linear-gradient(180deg,#020617,#0f172a)] px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <a
        href="#chat-panel"
        onClick={(event) => {
          event.preventDefault();
          focusWorkspaceTarget("chat", "chat-panel");
        }}
        className="sr-only absolute left-4 top-4 z-50 rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-950 shadow-lg focus:not-sr-only focus:outline-none focus:ring-2 focus:ring-cyan-400"
      >
        Skip to chat panel
      </a>
      <a
        href="#config-panel"
        onClick={(event) => {
          event.preventDefault();
          focusWorkspaceTarget("setup", "config-panel");
        }}
        className="sr-only absolute left-40 top-4 z-50 rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-950 shadow-lg focus:not-sr-only focus:outline-none focus:ring-2 focus:ring-cyan-400"
      >
        Skip to configuration
      </a>
      <a
        href="#graph-panel"
        onClick={(event) => {
          event.preventDefault();
          focusWorkspaceTarget("inspect", "graph-panel");
        }}
        className="sr-only absolute left-4 top-16 z-50 rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-950 shadow-lg focus:not-sr-only focus:outline-none focus:ring-2 focus:ring-cyan-400"
      >
        Skip to graph
      </a>
      <a
        href="#inspector-panel"
        onClick={(event) => {
          event.preventDefault();
          focusWorkspaceTarget("inspect", "inspector-panel");
        }}
        className="sr-only absolute left-40 top-16 z-50 rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-950 shadow-lg focus:not-sr-only focus:outline-none focus:ring-2 focus:ring-cyan-400"
      >
        Skip to inspector
      </a>
      <div className="mx-auto max-w-[1600px]">
        <header className="mb-6 rounded-[32px] border border-white/10 bg-slate-950/60 px-6 py-5 shadow-2xl shadow-slate-950/30 backdrop-blur">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs uppercase tracking-[0.24em] text-cyan-100">
                <Waypoints className="h-3.5 w-3.5" />
                Dispatcher Agent Studio
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl">
                  Multi-provider LLM orchestration, with a graph-first UI.
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-300">
                  Configure a dispatcher plus specialist agents, route tasks across
                  different providers and models, and inspect every input, output,
                  and execution state as a live graph.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-500">
                  <BrainCircuit className="h-3.5 w-3.5" />
                  Dispatcher
                </div>
                <p className="text-sm font-medium text-slate-50">
                  {dispatcher.provider} · {dispatcher.model}
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-500">
                  <Boxes className="h-3.5 w-3.5" />
                  Agents
                </div>
                <p className="text-sm font-medium text-slate-50">
                  {enabledAgents.length}/{agents.length} active
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="mb-1 text-xs uppercase tracking-[0.2em] text-slate-500">
                  Mode
                </div>
                <p className="text-sm font-medium text-slate-50">
                  Live providers + explicit mock fallback
                </p>
              </div>
            </div>
          </div>
        </header>

        <main className="space-y-4">
          <section
            aria-labelledby="workspace-tabs-heading"
            className="rounded-[28px] border border-white/10 bg-slate-950/60 p-4 shadow-2xl shadow-slate-950/30 backdrop-blur sm:p-5"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-cyan-200">
                  Workspace navigation
                </p>
                <h2 id="workspace-tabs-heading" className="mt-2 text-lg font-semibold text-slate-50">
                  Focus on one part of the studio at a time
                </h2>
                <p className="mt-1 max-w-2xl text-sm text-slate-300">
                  Switch between chat, runtime inspection, and setup without carrying the
                  full page layout on screen all at once.
                </p>
              </div>

              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300">
                Active workspace:{" "}
                <span className="font-medium text-slate-100">
                  {workspaceTabs.find((tab) => tab.id === activeTab)?.label}
                </span>
              </div>
            </div>

            <div
              role="tablist"
              aria-label="Studio workspaces"
              className="-mx-1 mt-4 flex gap-3 overflow-x-auto px-1 pb-1"
            >
              {workspaceTabs.map((tab) => {
                const isActive = tab.id === activeTab;
                const Icon = tab.icon;

                return (
                  <button
                    key={tab.id}
                    id={`workspace-tab-${tab.id}`}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    aria-controls={`workspace-panel-${tab.id}`}
                    onClick={() => setActiveTab(tab.id)}
                    className={`min-w-[220px] rounded-2xl border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 sm:min-w-[240px] ${
                      isActive
                        ? "border-cyan-400/40 bg-cyan-400/12 text-slate-50"
                        : "border-white/10 bg-white/4 text-slate-300 hover:border-cyan-400/25 hover:bg-cyan-400/8"
                    }`}
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4" />
                        <span className="text-sm font-semibold">{tab.label}</span>
                      </div>
                      <p
                        className={`mt-2 text-xs leading-5 ${
                          isActive ? "text-cyan-50/80" : "text-slate-300/80"
                        }`}
                      >
                        {tab.description}
                      </p>
                    </button>
                  );
                })}
              </div>
          </section>

          <div
            id="workspace-panel-chat"
            role="tabpanel"
            aria-labelledby="workspace-tab-chat"
            hidden={activeTab !== "chat"}
            className="min-w-0"
          >
            <ChatPanel
              draft={draft}
              messages={messages}
              samplePrompts={samplePrompts}
              isRunning={isRunning}
              statusText={displayStatusText}
              errorText={errorText}
              alert={runAlert}
              recentRuns={recentRuns}
              activeRun={activeRun}
              replayCursor={replayCursor}
              isReplayPlaying={isReplayPlaying}
              onDraftChange={setDraft}
              onSubmit={handleSubmit}
              onPickPrompt={setDraft}
              onOpenRun={handleOpenRun}
              onReplaySeek={handleReplaySeek}
              onReplayToggle={handleReplayToggle}
              onReplayStop={handleReplayStop}
            />
          </div>

          <div
            id="workspace-panel-inspect"
            role="tabpanel"
            aria-labelledby="workspace-tab-inspect"
            hidden={activeTab !== "inspect"}
            className="min-w-0 space-y-4"
          >
            <GraphPanel
              snapshot={snapshot}
              selectedNodeId={selectedNodeId}
              selectedTaskId={selectedTaskId}
              onSelectNode={(nodeId) => {
                setSelectedNodeId(nodeId);
                setSelectedTaskId(undefined);
              }}
              onSelectTask={(taskId) => {
                setSelectedTaskId(taskId);
                setSelectedNodeId(snapshot.taskSnapshots[taskId]?.agentId ?? "dispatcher");
              }}
            />
            <EventInspector
              snapshot={snapshot}
              events={displayedEvents}
              selectedNodeId={selectedNodeId}
              selectedTaskId={selectedTaskId}
            />
          </div>

          <div
            id="workspace-panel-setup"
            role="tabpanel"
            aria-labelledby="workspace-tab-setup"
            hidden={activeTab !== "setup"}
            className="min-w-0"
          >
            <ConfigPanel
              dispatcher={dispatcher}
              agents={agents}
              disabled={isRunning}
              onDispatcherChange={handleDispatcherChange}
              onAgentChange={handleAgentChange}
              onAddAgent={handleAddAgent}
              onAddAgentFromTemplate={handleAddAgentFromTemplate}
              onDuplicateAgent={handleDuplicateAgent}
              onMoveAgent={handleMoveAgent}
              onToggleAgent={handleToggleAgent}
              onRemoveAgent={handleRemoveAgent}
              onResetDefaults={handleResetDefaults}
              providerHealthById={providerHealthById}
              providerModelsById={providerModelsById}
              validationIssues={teamValidationIssues}
              savedTeams={savedTeams}
              onSaveCurrentTeam={handleSaveCurrentTeam}
              onLoadSavedTeam={handleLoadSavedTeam}
              onDeleteSavedTeam={handleDeleteSavedTeam}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
