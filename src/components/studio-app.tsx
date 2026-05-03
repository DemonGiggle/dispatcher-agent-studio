"use client";

import { useEffect, useMemo, useState } from "react";
import { Boxes, BrainCircuit, Waypoints } from "lucide-react";

import { ChatPanel } from "@/components/chat-panel";
import { ConfigPanel } from "@/components/config-panel";
import { EventInspector } from "@/components/event-inspector";
import { GraphPanel } from "@/components/graph-panel";
import {
  cloneAgentConfigs,
  cloneDispatcherConfig,
  cloneRuntimeOptions,
  cloneStarterMessages,
  samplePrompts,
} from "@/lib/defaults";
import {
  getDefaultModel,
  getDefaultProviderHealth,
  type ProviderHealthEntry,
} from "@/lib/model-catalog";
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
  const [statusText, setStatusText] = useState("Ready for a new request.");
  const [errorText, setErrorText] = useState<string>();
  const [runAlert, setRunAlert] = useState<RunAlert>();
  const [providerHealthById, setProviderHealthById] = useState<
    Record<ProviderId, ProviderHealthEntry>
  >(getDefaultProviderHealth);
  const [isRunning, setIsRunning] = useState(false);

  const snapshot = useMemo(
    () => deriveRunSnapshot(dispatcher, agents, events),
    [agents, dispatcher, events],
  );

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
        };

        if (active && payload.providers) {
          setProviderHealthById(payload.providers);
        }
      } catch {
        // Keep the default missing-key state when the status endpoint is unavailable.
      }
    })();

    return () => {
      active = false;
    };
  }, []);

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
      {
        id: createId("agent"),
        name: `Specialist ${current.length + 1}`,
        role: "Specialist",
        specialty: "Describe what this agent is best at.",
        provider: "mock",
        model: getDefaultModel("mock"),
        temperature: 0.45,
        systemPrompt:
          "You are a focused specialist. Return structured, practical recommendations for the assigned task.",
        accent: accentPalette[nextIndex % accentPalette.length],
      },
    ]);
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
    setStatusText("Ready for a new request.");
    setErrorText(undefined);
    setRunAlert(undefined);
    setIsRunning(false);
  };

  const handleSubmit = async () => {
    const prompt = draft.trim();

    if (!prompt || isRunning) {
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
    setIsRunning(true);

    let finalResponse: string | undefined;

    try {
      await streamEvents(
        {
          prompt,
          messages: nextMessages,
          dispatcher,
          agents,
          runtime,
        },
        (event) => {
          setEvents((current) => [...current, event]);
          setStatusText(buildStatusText(event));

          if (event.type === "agent-result") {
            setSelectedNodeId(event.nodeId);
          }

          if (event.type === "final-response") {
            finalResponse = event.response;
            setSelectedNodeId("dispatcher");
          }

          if (event.type === "run-error") {
            setErrorText(undefined);
            setRunAlert({
              tone: "error",
              title: "Run failed",
              detail: event.message,
              code: event.errorCode,
            });
            setSelectedNodeId(event.nodeId);
          }

          if (event.type === "run-cancelled") {
            setRunAlert({
              tone: "info",
              title: "Run cancelled",
              detail: event.message,
              code: event.errorCode,
            });
            setSelectedNodeId("dispatcher");
          }
        },
      );

      if (finalResponse) {
        const assistantMessage = finalResponse;

        setMessages((current) => [
          ...current,
          {
            id: createId("msg"),
            role: "assistant",
            content: assistantMessage,
          },
        ]);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unexpected client error.";
      setErrorText(undefined);
      setRunAlert({
        tone: "error",
        title: "Request failed",
        detail: message,
      });
      setStatusText(message);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.14),transparent_28%),radial-gradient(circle_at_85%_18%,rgba(124,58,237,0.16),transparent_24%),linear-gradient(180deg,#020617,#0f172a)] px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
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

            <div className="grid gap-3 sm:grid-cols-3">
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
                  {agents.length} specialist{agents.length === 1 ? "" : "s"}
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

        <main className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)_520px]">
          <ConfigPanel
            dispatcher={dispatcher}
            agents={agents}
            disabled={isRunning}
            onDispatcherChange={handleDispatcherChange}
            onAgentChange={handleAgentChange}
            onAddAgent={handleAddAgent}
            onRemoveAgent={handleRemoveAgent}
            onResetDefaults={handleResetDefaults}
            providerHealthById={providerHealthById}
          />

          <ChatPanel
            draft={draft}
            messages={messages}
            samplePrompts={samplePrompts}
            isRunning={isRunning}
            statusText={statusText}
            errorText={errorText}
            alert={runAlert}
            onDraftChange={setDraft}
            onSubmit={handleSubmit}
            onPickPrompt={setDraft}
          />

          <div className="space-y-4">
            <GraphPanel
              snapshot={snapshot}
              selectedNodeId={selectedNodeId}
              onSelectNode={setSelectedNodeId}
            />
            <EventInspector
              snapshot={snapshot}
              events={events}
              selectedNodeId={selectedNodeId}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
