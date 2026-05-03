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

export function savePersistedStudioState(state: PersistedStudioState) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STUDIO_PERSISTENCE_KEY, JSON.stringify(state));
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
