"use client";

import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Plus,
  Power,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";

import {
  agentTemplates,
  filterAgentTemplates,
  type AgentValidationIssue,
} from "@/lib/agent-builder";
import type { SavedTeamRecord } from "@/lib/studio-persistence";
import {
  getDefaultProviderHealth,
  getDefaultModel,
  getModelEntry,
  getProviderEntry,
  getProviderModels,
  type ProviderHealthEntry,
  providerOptions,
} from "@/lib/model-catalog";
import type { AgentConfig, DispatcherConfig, ProviderId } from "@/lib/types";

type ConfigPanelProps = {
  dispatcher: DispatcherConfig;
  agents: AgentConfig[];
  disabled: boolean;
  onDispatcherChange: <K extends keyof DispatcherConfig>(
    field: K,
    value: DispatcherConfig[K],
  ) => void;
  onAgentChange: <K extends keyof AgentConfig>(
    agentId: string,
    field: K,
    value: AgentConfig[K],
  ) => void;
  onAddAgent: () => void;
  onAddAgentFromTemplate: (templateId: string) => void;
  onDuplicateAgent: (agentId: string) => void;
  onMoveAgent: (agentId: string, direction: "up" | "down") => void;
  onToggleAgent: (agentId: string) => void;
  onRemoveAgent: (agentId: string) => void;
  onResetDefaults: () => void;
  providerHealthById: Record<ProviderId, ProviderHealthEntry>;
  validationIssues: AgentValidationIssue[];
  savedTeams: SavedTeamRecord[];
  onSaveCurrentTeam: (name: string) => void;
  onLoadSavedTeam: (teamId: string) => void;
  onDeleteSavedTeam: (teamId: string) => void;
};

type FieldProps = {
  label: string;
  hint?: string;
  children: React.ReactNode;
};

const focusRingClass =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950";

function Field({ label, hint, children }: FieldProps) {
  return (
    <label className="block space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-slate-500">
          {label}
        </span>
        {hint ? <span className="text-[11px] text-slate-500">{hint}</span> : null}
      </div>
      {children}
    </label>
  );
}

function inputClassName() {
  return "w-full rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-slate-50 outline-none transition placeholder:text-slate-400 focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/10";
}

function renderProviderHealth(
  providerId: ProviderId,
  providerHealthById: Record<ProviderId, ProviderHealthEntry>,
) {
  const health = providerHealthById[providerId] ?? getDefaultProviderHealth()[providerId];

  if (health.status === "mock") {
    return (
      <span className="rounded-full border border-slate-400/20 bg-slate-400/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-slate-200">
        mock fallback
      </span>
    );
  }

  if (health.status === "configured") {
    return (
      <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-emerald-100">
        credentials ready
      </span>
    );
  }

  return (
    <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-amber-100">
      missing key
    </span>
  );
}

function CapabilityEditor({
  capabilities,
  disabled,
  onChange,
}: {
  capabilities: string[];
  disabled: boolean;
  onChange: (capabilities: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  const addCapability = () => {
    const nextValue = draft.trim();

    if (!nextValue) {
      return;
    }

    const exists = capabilities.some(
      (capability) => capability.toLowerCase() === nextValue.toLowerCase(),
    );

    if (exists || capabilities.length >= 6) {
      setDraft("");
      return;
    }

    onChange([...capabilities, nextValue]);
    setDraft("");
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {capabilities.map((capability) => (
          <span
            key={capability}
            className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-100"
          >
            {capability}
            <button
              type="button"
              onClick={() =>
                onChange(capabilities.filter((item) => item !== capability))
              }
              disabled={disabled}
              className="text-cyan-100/80 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={`Remove ${capability}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          className={inputClassName()}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              addCapability();
            }
          }}
          disabled={disabled}
          placeholder="Add a capability"
        />
        <button
          type="button"
          onClick={addCapability}
          disabled={disabled || draft.trim().length === 0 || capabilities.length >= 6}
          className={`rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200 transition hover:border-cyan-400/30 hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-60 ${focusRingClass}`}
        >
          Add
        </button>
      </div>
    </div>
  );
}

export function ConfigPanel({
  dispatcher,
  agents,
  disabled,
  onDispatcherChange,
  onAgentChange,
  onAddAgent,
  onAddAgentFromTemplate,
  onDuplicateAgent,
  onMoveAgent,
  onToggleAgent,
  onRemoveAgent,
  onResetDefaults,
  providerHealthById,
  validationIssues,
  savedTeams,
  onSaveCurrentTeam,
  onLoadSavedTeam,
  onDeleteSavedTeam,
}: ConfigPanelProps) {
  const [teamNameDraft, setTeamNameDraft] = useState("");
  const [templateQuery, setTemplateQuery] = useState("");
  const [templateCategory, setTemplateCategory] = useState("all");
  const dispatcherProviderEntry = getProviderEntry(dispatcher.provider);
  const dispatcherModels = getProviderModels(dispatcher.provider);
  const dispatcherModelEntry = getModelEntry(dispatcher.provider, dispatcher.model);
  const activeAgents = agents.filter((agent) => agent.enabled);
  const templateCategories = useMemo(
    () => ["all", ...new Set(agentTemplates.map((template) => template.category))],
    [],
  );
  const visibleTemplates = useMemo(
    () =>
      filterAgentTemplates(agentTemplates, {
        category: templateCategory,
        query: templateQuery,
      }),
    [templateCategory, templateQuery],
  );
  const hasTemplateFilters =
    templateCategory !== "all" || templateQuery.trim().length > 0;

  const { teamIssues, issuesByAgentId } = useMemo(() => {
    const grouped = new Map<string, AgentValidationIssue[]>();

    for (const issue of validationIssues) {
      if (!issue.agentId) {
        continue;
      }

      grouped.set(issue.agentId, [...(grouped.get(issue.agentId) ?? []), issue]);
    }

    return {
      teamIssues: validationIssues.filter((issue) => issue.scope === "team"),
      issuesByAgentId: grouped,
    };
  }, [validationIssues]);

  return (
    <section
      id="config-panel"
      aria-labelledby="orchestration-setup-heading"
      tabIndex={-1}
      className="space-y-4 scroll-mt-4"
    >
      <section className="rounded-[28px] border border-white/10 bg-slate-950/70 p-5 shadow-2xl shadow-slate-950/30">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="orchestration-setup-heading" className="text-sm font-semibold text-slate-50">
              Orchestration setup
            </h2>
            <p className="text-xs text-slate-400">
              Configure the dispatcher and the active team that will execute each run.
            </p>
          </div>
          <button
            type="button"
            onClick={onResetDefaults}
            disabled={disabled}
            className={`inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200 transition hover:border-cyan-400/30 hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-60 ${focusRingClass}`}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
        </div>

        <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-cyan-300" />
            <p className="text-sm font-semibold text-slate-100">Dispatcher</p>
            {renderProviderHealth(dispatcher.provider, providerHealthById)}
          </div>

          <div className="grid gap-3">
            <Field label="Name">
              <input
                className={inputClassName()}
                value={dispatcher.name}
                onChange={(event) => onDispatcherChange("name", event.target.value)}
                disabled={disabled}
              />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Provider">
                <select
                  className={inputClassName()}
                  value={dispatcher.provider}
                  onChange={(event) => {
                    const nextProvider = event.target.value as DispatcherConfig["provider"];
                    onDispatcherChange("provider", nextProvider);
                    onDispatcherChange("model", getDefaultModel(nextProvider));
                  }}
                  disabled={disabled}
                >
                  {providerOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Model">
                <select
                  className={inputClassName()}
                  value={dispatcher.model}
                  onChange={(event) => onDispatcherChange("model", event.target.value)}
                  disabled={disabled}
                >
                  {dispatcherModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="rounded-xl border border-white/8 bg-white/4 px-3 py-2 text-xs text-slate-300">
              <p className="font-medium text-slate-100">{dispatcherProviderEntry.label}</p>
              <p className="mt-1 text-slate-400">
                {dispatcherProviderEntry.description}
              </p>
              <p className="mt-2 text-slate-500">
                Model: {dispatcherModelEntry?.description ?? dispatcher.model}
              </p>
              {dispatcherProviderEntry.envVar ? (
                <p className="mt-2 text-slate-500">
                  Env: {dispatcherProviderEntry.envVar}
                </p>
              ) : null}
            </div>

            <Field label="Temperature">
              <input
                className={inputClassName()}
                type="number"
                min={0}
                max={1.5}
                step={0.05}
                value={dispatcher.temperature}
                onChange={(event) =>
                  onDispatcherChange(
                    "temperature",
                    Number(event.target.value) as DispatcherConfig["temperature"],
                  )
                }
                disabled={disabled}
              />
            </Field>

            <Field label="System prompt">
              <textarea
                className={`${inputClassName()} min-h-28 resize-y`}
                value={dispatcher.systemPrompt}
                onChange={(event) =>
                  onDispatcherChange("systemPrompt", event.target.value)
                }
                disabled={disabled}
              />
            </Field>
          </div>
        </div>
      </section>

      <section
        aria-labelledby="agent-builder-heading"
        className="rounded-[28px] border border-white/10 bg-slate-950/70 p-5 shadow-2xl shadow-slate-950/30"
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="agent-builder-heading" className="text-sm font-semibold text-slate-50">
              Agent builder
            </h2>
            <p className="text-xs text-slate-400">
              Use templates, capability chips, and team controls to shape the active roster.
            </p>
          </div>
          <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] text-emerald-100">
            {activeAgents.length}/{agents.length} active in the next run
          </div>
        </div>

        <div className="mb-4 rounded-2xl border border-white/10 bg-white/4 p-4">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                Start from a template
              </p>
              <p className="mt-1 text-sm text-slate-300">
                Browse specialist presets, then filter down to the roles you need.
              </p>
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-slate-300">
              {visibleTemplates.length}/{agentTemplates.length} shown
            </div>
          </div>

          <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <label className="space-y-1.5">
              <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-slate-500">
                Find a template
              </span>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  className={`${inputClassName()} pl-9`}
                  value={templateQuery}
                  onChange={(event) => setTemplateQuery(event.target.value)}
                  placeholder="Search roles, specialties, or capabilities"
                  aria-label="Filter templates"
                />
              </div>
            </label>

            <div className="space-y-1.5">
              <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-slate-500">
                Filter by focus
              </span>
              <div className="flex flex-wrap gap-2">
                {templateCategories.map((category) => {
                  const isActive = templateCategory === category;

                  return (
                    <button
                      key={category}
                      type="button"
                      onClick={() => setTemplateCategory(category)}
                      className={`rounded-full border px-3 py-1.5 text-xs transition ${focusRingClass} ${
                        isActive
                          ? "border-cyan-400/40 bg-cyan-400/15 text-cyan-100"
                          : "border-white/10 bg-white/5 text-slate-300 hover:border-cyan-400/30 hover:bg-cyan-400/10"
                      }`}
                      aria-pressed={isActive}
                    >
                      {category === "all" ? "All templates" : category}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="space-y-2" role="list" aria-label="Agent templates">
            {visibleTemplates.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 bg-slate-900/40 p-4 text-sm text-slate-400">
                No templates match the current filters.
              </div>
            ) : (
              <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
                {visibleTemplates.map((template) => (
                  <div key={template.id} role="listitem">
                    <button
                      type="button"
                      onClick={() => onAddAgentFromTemplate(template.id)}
                      disabled={disabled}
                      className={`w-full rounded-2xl border border-white/10 bg-slate-900/60 p-3 text-left transition hover:border-cyan-400/30 hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-60 ${focusRingClass}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-3">
                            <span
                              className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: template.accent }}
                            />
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-medium text-slate-100">
                                  {template.label}
                                </p>
                                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-slate-300">
                                  {template.category}
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-slate-400">
                                {template.description}
                              </p>
                            </div>
                          </div>

                          <p className="mt-3 text-sm text-slate-300">{template.specialty}</p>

                          <div className="mt-3 flex flex-wrap gap-2">
                            {template.capabilities.map((capability) => (
                              <span
                                key={capability}
                                className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-0.5 text-[10px] text-cyan-100"
                              >
                                {capability}
                              </span>
                            ))}
                          </div>
                        </div>

                        <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] uppercase tracking-[0.2em] text-slate-300">
                          Add
                        </span>
                      </div>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onAddAgent}
              disabled={disabled}
              className={`inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200 transition hover:border-cyan-400/30 hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-60 ${focusRingClass}`}
            >
              <Plus className="h-3.5 w-3.5" />
              Add custom agent
            </button>

            {hasTemplateFilters ? (
              <button
                type="button"
                onClick={() => {
                  setTemplateCategory("all");
                  setTemplateQuery("");
                }}
                className={`rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition hover:border-cyan-400/30 hover:bg-cyan-400/10 ${focusRingClass}`}
              >
                Clear filters
              </button>
            ) : null}
          </div>
        </div>

        <div className="mb-4 rounded-2xl border border-white/10 bg-white/4 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                Saved teams
              </p>
              <p className="mt-1 text-sm text-slate-300">
                Save the current dispatcher + agent setup and reload it later.
              </p>
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-slate-300">
              {savedTeams.length} saved
            </div>
          </div>

          <div className="mb-3 flex flex-col gap-2 sm:flex-row">
            <input
              className={inputClassName()}
              value={teamNameDraft}
              onChange={(event) => setTeamNameDraft(event.target.value)}
              placeholder="Name this team"
              aria-label="Team name"
              disabled={disabled}
            />
            <button
              type="button"
              onClick={() => {
                const nextName = teamNameDraft.trim();

                if (!nextName) {
                  return;
                }

                onSaveCurrentTeam(nextName);
                setTeamNameDraft("");
              }}
              disabled={disabled || teamNameDraft.trim().length === 0}
              className={`rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200 transition hover:border-cyan-400/30 hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-60 ${focusRingClass}`}
            >
              Save current team
            </button>
          </div>

          <div className="space-y-2" role="list">
            {savedTeams.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 bg-slate-900/40 p-3 text-sm text-slate-400">
                No saved teams yet. Save a team once and it will be available after refresh.
              </div>
            ) : (
              savedTeams.map((team) => (
                <div
                  key={team.id}
                  role="listitem"
                  className="flex flex-col items-start justify-between gap-3 rounded-xl border border-white/10 bg-slate-900/60 p-3 sm:flex-row sm:items-center"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-100">{team.name}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {team.agents.filter((agent) => agent.enabled).length}/
                      {team.agents.length} active agents ·{" "}
                      {new Date(team.savedAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onLoadSavedTeam(team.id)}
                      disabled={disabled}
                      className={`rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200 transition hover:border-cyan-400/30 hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-60 ${focusRingClass}`}
                    >
                      Load
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteSavedTeam(team.id)}
                      disabled={disabled}
                      className={`rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200 transition hover:border-rose-400/30 hover:bg-rose-400/10 hover:text-rose-100 disabled:cursor-not-allowed disabled:opacity-60 ${focusRingClass}`}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {teamIssues.length > 0 ? (
          <div
            role="alert"
            className="mb-4 rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-100"
          >
            <p className="font-medium">Team setup needs attention before a run.</p>
            <ul className="mt-2 space-y-1 text-sm/6">
              {teamIssues.map((issue, index) => (
                <li key={`${issue.message}-${index}`}>- {issue.message}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="space-y-4">
          {agents.map((agent, index) => {
            const providerEntry = getProviderEntry(agent.provider);
            const providerModels = getProviderModels(agent.provider);
            const providerModelEntry = getModelEntry(agent.provider, agent.model);
            const agentIssues = issuesByAgentId.get(agent.id) ?? [];

            return (
              <section
                key={agent.id}
                aria-labelledby={`${agent.id}-heading`}
                className={`rounded-2xl border p-4 ${
                  agent.enabled
                    ? "border-white/10 bg-white/4"
                    : "border-white/6 bg-slate-950/40 opacity-75"
                }`}
                style={{ boxShadow: `inset 0 0 0 1px ${agent.accent}20` }}
              >
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: agent.accent }}
                      />
                      <div>
                        <h3 id={`${agent.id}-heading`} className="text-sm font-semibold text-slate-100">
                          {agent.name}
                        </h3>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-slate-300">
                            {agent.role}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] ${
                              agent.enabled
                                ? "border border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
                                : "border border-slate-400/20 bg-slate-400/10 text-slate-300"
                            }`}
                          >
                            {agent.enabled ? "enabled" : "disabled"}
                          </span>
                          {renderProviderHealth(agent.provider, providerHealthById)}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {agent.capabilities.map((capability) => (
                        <span
                          key={capability}
                          className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-0.5 text-[10px] text-cyan-100"
                        >
                          {capability}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onToggleAgent(agent.id)}
                      disabled={disabled}
                      className={`inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200 transition hover:border-cyan-400/30 hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-60 ${focusRingClass}`}
                    >
                      <Power className="h-3.5 w-3.5" />
                      {agent.enabled ? "Disable" : "Enable"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDuplicateAgent(agent.id)}
                      disabled={disabled}
                      className={`rounded-full border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:border-cyan-400/30 hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-60 ${focusRingClass}`}
                      aria-label={`Duplicate ${agent.name}`}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onMoveAgent(agent.id, "up")}
                      disabled={disabled || index === 0}
                      className={`rounded-full border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:border-cyan-400/30 hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-60 ${focusRingClass}`}
                      aria-label={`Move ${agent.name} up`}
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onMoveAgent(agent.id, "down")}
                      disabled={disabled || index === agents.length - 1}
                      className={`rounded-full border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:border-cyan-400/30 hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-60 ${focusRingClass}`}
                      aria-label={`Move ${agent.name} down`}
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemoveAgent(agent.id)}
                      disabled={disabled || agents.length === 1}
                      className={`rounded-full border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:border-rose-400/30 hover:bg-rose-400/10 hover:text-rose-100 disabled:cursor-not-allowed disabled:opacity-60 ${focusRingClass}`}
                      aria-label={`Remove ${agent.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                  <div className="rounded-xl border border-white/8 bg-white/4 p-3">
                    <p className="mb-1 text-[10px] uppercase tracking-[0.2em] text-slate-500">
                      Specialty
                    </p>
                    <p className="text-sm text-slate-200">{agent.specialty}</p>
                  </div>
                  <div className="rounded-xl border border-white/8 bg-white/4 p-3 text-xs text-slate-300">
                    <p className="font-medium text-slate-100">{providerEntry.label}</p>
                    <p className="mt-1 text-slate-400">{providerEntry.description}</p>
                    <p className="mt-2 text-slate-500">
                      Model: {providerModelEntry?.description ?? agent.model}
                    </p>
                    {providerEntry.envVar ? (
                      <p className="mt-2 text-slate-500">
                        Env: {providerEntry.envVar}
                      </p>
                    ) : null}
                  </div>
                </div>

                {agentIssues.length > 0 ? (
                  <div
                    role="alert"
                    className="mb-4 rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-sm text-rose-100"
                  >
                    <p className="font-medium">Needs attention</p>
                    <ul className="mt-2 space-y-1 text-sm/6">
                      {agentIssues.map((issue, issueIndex) => (
                        <li key={`${issue.message}-${issueIndex}`}>- {issue.message}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="grid gap-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Name">
                      <input
                        className={inputClassName()}
                        value={agent.name}
                        onChange={(event) =>
                          onAgentChange(agent.id, "name", event.target.value)
                        }
                        disabled={disabled}
                      />
                    </Field>

                    <Field label="Role">
                      <input
                        className={inputClassName()}
                        value={agent.role}
                        onChange={(event) =>
                          onAgentChange(agent.id, "role", event.target.value)
                        }
                        disabled={disabled}
                      />
                    </Field>
                  </div>

                  <Field label="Specialty">
                    <input
                      className={inputClassName()}
                      value={agent.specialty}
                      onChange={(event) =>
                        onAgentChange(agent.id, "specialty", event.target.value)
                      }
                      disabled={disabled}
                    />
                  </Field>

                  <Field label="Capabilities" hint={`${agent.capabilities.length}/6`}>
                    <CapabilityEditor
                      capabilities={agent.capabilities}
                      disabled={disabled}
                      onChange={(capabilities) =>
                        onAgentChange(agent.id, "capabilities", capabilities)
                      }
                    />
                  </Field>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Provider">
                      <select
                        className={inputClassName()}
                        value={agent.provider}
                        onChange={(event) => {
                          const nextProvider = event.target.value as AgentConfig["provider"];
                          onAgentChange(agent.id, "provider", nextProvider);
                          onAgentChange(agent.id, "model", getDefaultModel(nextProvider));
                        }}
                        disabled={disabled}
                      >
                        {providerOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field label="Model">
                      <select
                        className={inputClassName()}
                        value={agent.model}
                        onChange={(event) =>
                          onAgentChange(agent.id, "model", event.target.value)
                        }
                        disabled={disabled}
                      >
                        {providerModels.map((model) => (
                          <option key={model.id} value={model.id}>
                            {model.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Temperature">
                      <input
                        className={inputClassName()}
                        type="number"
                        min={0}
                        max={1.5}
                        step={0.05}
                        value={agent.temperature}
                        onChange={(event) =>
                          onAgentChange(
                            agent.id,
                            "temperature",
                            Number(event.target.value) as AgentConfig["temperature"],
                          )
                        }
                        disabled={disabled}
                      />
                    </Field>

                    <Field label="Accent">
                      <input
                        className={`${inputClassName()} h-[42px] px-2`}
                        type="color"
                        value={agent.accent}
                        onChange={(event) =>
                          onAgentChange(agent.id, "accent", event.target.value)
                        }
                        disabled={disabled}
                      />
                    </Field>
                  </div>

                  <Field label="System prompt">
                    <textarea
                      className={`${inputClassName()} min-h-28 resize-y`}
                      value={agent.systemPrompt}
                      onChange={(event) =>
                        onAgentChange(agent.id, "systemPrompt", event.target.value)
                      }
                      disabled={disabled}
                    />
                  </Field>
                </div>
              </section>
            );
          })}
        </div>
      </section>
    </section>
  );
}
