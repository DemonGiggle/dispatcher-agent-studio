import { z } from "zod";

import {
  agentConfigSchema,
  conversationMessageSchema,
  dispatcherConfigSchema,
  type AgentConfig,
  type ConversationMessage,
  type DispatcherConfig,
  type OrchestrationEvent,
} from "@/lib/types";

export const STUDIO_PERSISTENCE_KEY = "dispatcher-agent-studio:v1";
export const STUDIO_PERSISTENCE_VERSION = 1;
const MAX_RECENT_RUNS = 12;
const MAX_SAVED_TEAMS = 12;
const MAX_PERSISTED_AUTOSAVE_MESSAGES = 40;
const MAX_PERSISTED_RUN_MESSAGES = 24;
const MAX_PERSISTED_TEXT_CHARS = 5_000;

const orchestrationEventSchema = z.custom<OrchestrationEvent>();

const autosavedStudioSchema = z.object({
  dispatcher: dispatcherConfigSchema,
  agents: z.array(agentConfigSchema).min(1).max(8),
  messages: z.array(conversationMessageSchema),
  draft: z.string(),
});

const savedTeamSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  savedAt: z.string().min(1),
  dispatcher: dispatcherConfigSchema,
  agents: z.array(agentConfigSchema).min(1).max(8),
});

const savedRunSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  prompt: z.string().min(1),
  createdAt: z.string().min(1),
  status: z.enum(["completed", "cancelled", "error"]),
  dispatcher: dispatcherConfigSchema,
  agents: z.array(agentConfigSchema).min(1).max(8),
  messages: z.array(conversationMessageSchema),
  events: z.array(orchestrationEventSchema),
});

const persistedStudioStateSchema = z.object({
  schemaVersion: z.literal(STUDIO_PERSISTENCE_VERSION),
  autosavedStudio: autosavedStudioSchema.nullish(),
  savedTeams: z.array(savedTeamSchema).default([]),
  recentRuns: z.array(savedRunSchema).default([]),
});

export type AutosavedStudioState = z.infer<typeof autosavedStudioSchema>;
export type SavedTeamRecord = z.infer<typeof savedTeamSchema>;
export type SavedRunRecord = z.infer<typeof savedRunSchema>;
export type PersistedStudioState = z.infer<typeof persistedStudioStateSchema>;
export type PersistedStudioSaveResult =
  | { status: "saved"; retainedRuns: number }
  | { status: "degraded"; retainedRuns: number; droppedRuns: number }
  | { status: "failed"; retainedRuns: number; droppedRuns: number };

export function createEmptyPersistedStudioState(): PersistedStudioState {
  return {
    schemaVersion: STUDIO_PERSISTENCE_VERSION,
    autosavedStudio: undefined,
    savedTeams: [],
    recentRuns: [],
  };
}

function migratePersistedState(value: unknown): PersistedStudioState {
  if (
    typeof value === "object" &&
    value !== null &&
    Reflect.get(value, "schemaVersion") === STUDIO_PERSISTENCE_VERSION
  ) {
    const parsed = persistedStudioStateSchema.safeParse(value);
    return parsed.success ? parsed.data : createEmptyPersistedStudioState();
  }

  return createEmptyPersistedStudioState();
}

export function loadPersistedStudioState(): PersistedStudioState {
  if (typeof window === "undefined") {
    return createEmptyPersistedStudioState();
  }

  const rawValue = window.localStorage.getItem(STUDIO_PERSISTENCE_KEY);

  if (!rawValue) {
    return createEmptyPersistedStudioState();
  }

  try {
    return migratePersistedState(JSON.parse(rawValue));
  } catch {
    return createEmptyPersistedStudioState();
  }
}

function truncateText(value: string): string {
  if (value.length <= MAX_PERSISTED_TEXT_CHARS) {
    return value;
  }

  return `${value.slice(0, MAX_PERSISTED_TEXT_CHARS)}… [truncated ${value.length - MAX_PERSISTED_TEXT_CHARS} chars]`;
}

function compactMessages(
  messages: ConversationMessage[],
  maxMessages: number,
): ConversationMessage[] {
  return messages.slice(-maxMessages).map((message) => ({
    ...message,
    content: truncateText(message.content),
  }));
}

function compactEvent(event: OrchestrationEvent): OrchestrationEvent {
  const nextEvent = structuredClone(event);

  switch (nextEvent.type) {
    case "run-start":
      nextEvent.prompt = truncateText(nextEvent.prompt);
      return nextEvent;
    case "node-status":
      nextEvent.title = truncateText(nextEvent.title);
      nextEvent.detail = truncateText(nextEvent.detail);
      nextEvent.input = nextEvent.input ? truncateText(nextEvent.input) : nextEvent.input;
      nextEvent.output = nextEvent.output ? truncateText(nextEvent.output) : nextEvent.output;
      return nextEvent;
    case "dispatcher-plan":
      nextEvent.summary = truncateText(nextEvent.summary);
      nextEvent.input = truncateText(nextEvent.input);
      nextEvent.output = truncateText(nextEvent.output);
      return nextEvent;
    case "task-assignment":
      nextEvent.detail = truncateText(nextEvent.detail);
      return nextEvent;
    case "node-chunk":
      nextEvent.title = truncateText(nextEvent.title);
      nextEvent.detail = truncateText(nextEvent.detail);
      nextEvent.input = truncateText(nextEvent.input);
      nextEvent.chunk = truncateText(nextEvent.chunk);
      nextEvent.aggregate = truncateText(nextEvent.aggregate);
      return nextEvent;
    case "agent-result":
      nextEvent.input = truncateText(nextEvent.input);
      nextEvent.output = truncateText(nextEvent.output);
      return nextEvent;
    case "final-response":
      nextEvent.response = truncateText(nextEvent.response);
      nextEvent.input = truncateText(nextEvent.input);
      nextEvent.output = truncateText(nextEvent.output);
      return nextEvent;
    case "provider-warning":
      nextEvent.message = truncateText(nextEvent.message);
      return nextEvent;
    case "run-complete":
    case "run-cancelled":
      nextEvent.message = truncateText(nextEvent.message);
      return nextEvent;
    case "run-error":
      nextEvent.message = truncateText(nextEvent.message);
      return nextEvent;
  }
}

function compactAutosavedStudio(
  autosavedStudio: PersistedStudioState["autosavedStudio"],
): PersistedStudioState["autosavedStudio"] {
  if (!autosavedStudio) {
    return autosavedStudio;
  }

  return {
    dispatcher: cloneDispatcher(autosavedStudio.dispatcher),
    agents: cloneAgents(autosavedStudio.agents),
    messages: compactMessages(autosavedStudio.messages, MAX_PERSISTED_AUTOSAVE_MESSAGES),
    draft: truncateText(autosavedStudio.draft),
  };
}

function compactRunRecord(runRecord: SavedRunRecord): SavedRunRecord {
  return {
    ...runRecord,
    prompt: truncateText(runRecord.prompt),
    messages: compactMessages(runRecord.messages, MAX_PERSISTED_RUN_MESSAGES),
    events: runRecord.events.map(compactEvent),
  };
}

function buildPersistedStateCandidate(
  state: PersistedStudioState,
  retainedRuns: number,
): PersistedStudioState {
  return {
    schemaVersion: STUDIO_PERSISTENCE_VERSION,
    autosavedStudio: compactAutosavedStudio(state.autosavedStudio),
    savedTeams: state.savedTeams,
    recentRuns: state.recentRuns.slice(0, retainedRuns).map(compactRunRecord),
  };
}

function isQuotaExceededError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "QuotaExceededError") ||
    (typeof error === "object" &&
      error !== null &&
      Reflect.get(error, "name") === "QuotaExceededError")
  );
}

function getPersistenceRunCounts(totalRuns: number): number[] {
  return [...new Set([totalRuns, 8, 4, 2, 1, 0].map((count) => Math.min(totalRuns, count)))];
}

export function savePersistedStudioState(
  state: PersistedStudioState,
): PersistedStudioSaveResult {
  if (typeof window === "undefined") {
    return { status: "saved", retainedRuns: state.recentRuns.length };
  }

  const runCounts = getPersistenceRunCounts(state.recentRuns.length);

  for (const retainedRuns of runCounts) {
    const nextState = buildPersistedStateCandidate(state, retainedRuns);

    try {
      window.localStorage.setItem(STUDIO_PERSISTENCE_KEY, JSON.stringify(nextState));

      if (retainedRuns === state.recentRuns.length) {
        return { status: "saved", retainedRuns };
      }

      const droppedRuns = state.recentRuns.length - retainedRuns;
      console.warn("Studio persistence trimmed recent runs to fit browser storage.", {
        retainedRuns,
        droppedRuns,
      });
      return { status: "degraded", retainedRuns, droppedRuns };
    } catch (error) {
      if (!isQuotaExceededError(error)) {
        console.error("Studio persistence failed unexpectedly.", error);
        return {
          status: "failed",
          retainedRuns: 0,
          droppedRuns: state.recentRuns.length,
        };
      }
    }
  }

  console.error("Studio persistence could not save state because browser storage is full.");
  return {
    status: "failed",
    retainedRuns: 0,
    droppedRuns: state.recentRuns.length,
  };
}

export function cloneDispatcher(dispatcher: DispatcherConfig): DispatcherConfig {
  return { ...dispatcher };
}

export function cloneAgents(agents: AgentConfig[]): AgentConfig[] {
  return agents.map((agent) => ({ ...agent, capabilities: [...agent.capabilities] }));
}

export function cloneMessages(messages: ConversationMessage[]): ConversationMessage[] {
  return messages.map((message) => ({ ...message }));
}

export function saveRunRecord(
  recentRuns: SavedRunRecord[],
  runRecord: SavedRunRecord,
): SavedRunRecord[] {
  return [runRecord, ...recentRuns.filter((run) => run.id !== runRecord.id)].slice(
    0,
    MAX_RECENT_RUNS,
  );
}

export function saveTeamRecord(
  savedTeams: SavedTeamRecord[],
  teamRecord: SavedTeamRecord,
): SavedTeamRecord[] {
  return [teamRecord, ...savedTeams.filter((team) => team.id !== teamRecord.id)].slice(
    0,
    MAX_SAVED_TEAMS,
  );
}

export function deleteTeamRecord(
  savedTeams: SavedTeamRecord[],
  teamId: string,
): SavedTeamRecord[] {
  return savedTeams.filter((team) => team.id !== teamId);
}
