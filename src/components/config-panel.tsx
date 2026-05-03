"use client";

import { RotateCcw, Sparkles, Trash2 } from "lucide-react";

import {
  getDefaultModel,
  getProviderEntry,
  getProviderModels,
  providerOptions,
} from "@/lib/model-catalog";
import type { AgentConfig, DispatcherConfig } from "@/lib/types";

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
  onRemoveAgent: (agentId: string) => void;
  onResetDefaults: () => void;
};

type FieldProps = {
  label: string;
  children: React.ReactNode;
};

function Field({ label, children }: FieldProps) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function inputClassName() {
  return "w-full rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/10";
}

export function ConfigPanel({
  dispatcher,
  agents,
  disabled,
  onDispatcherChange,
  onAgentChange,
  onAddAgent,
  onRemoveAgent,
  onResetDefaults,
}: ConfigPanelProps) {
  const dispatcherProviderEntry = getProviderEntry(dispatcher.provider);
  const dispatcherModels = getProviderModels(dispatcher.provider);

  return (
    <div className="space-y-4">
      <div className="rounded-[28px] border border-white/10 bg-slate-950/70 p-5 shadow-2xl shadow-slate-950/30">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-50">
              Orchestration setup
            </h2>
            <p className="text-xs text-slate-400">
              Configure the dispatcher and each specialist&apos;s capabilities.
            </p>
          </div>
          <button
            type="button"
            onClick={onResetDefaults}
            disabled={disabled}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200 transition hover:border-cyan-400/30 hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
        </div>

        <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-cyan-300" />
            <p className="text-sm font-semibold text-slate-100">Dispatcher</p>
          </div>

          <div className="grid gap-3">
            <Field label="Name">
              <input
                className={inputClassName()}
                value={dispatcher.name}
                onChange={(event) =>
                  onDispatcherChange("name", event.target.value)
                }
                disabled={disabled}
              />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Provider">
                <select
                  className={inputClassName()}
                  value={dispatcher.provider}
                  onChange={(event) =>
                    (() => {
                      const nextProvider = event.target.value as DispatcherConfig["provider"];
                      onDispatcherChange("provider", nextProvider);
                      onDispatcherChange("model", getDefaultModel(nextProvider));
                    })()
                  }
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
                  onChange={(event) =>
                    onDispatcherChange("model", event.target.value)
                  }
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
              <p className="font-medium text-slate-100">
                {dispatcherProviderEntry.label}
              </p>
              <p className="mt-1 text-slate-400">
                {dispatcherProviderEntry.description}
              </p>
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
      </div>

      <div className="rounded-[28px] border border-white/10 bg-slate-950/70 p-5 shadow-2xl shadow-slate-950/30">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-50">Worker agents</h2>
            <p className="text-xs text-slate-400">
              Mix providers and models per specialist. Missing server keys fall back
              to the mock provider with a visible warning.
            </p>
          </div>
          <button
            type="button"
            onClick={onAddAgent}
            disabled={disabled}
            className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs text-emerald-100 transition hover:border-emerald-300/40 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Add agent
          </button>
        </div>

        <div className="space-y-4">
          {agents.map((agent) => (
            (() => {
              const providerEntry = getProviderEntry(agent.provider);
              const providerModels = getProviderModels(agent.provider);

              return (
            <section
              key={agent.id}
              className="rounded-2xl border border-white/10 bg-white/4 p-4"
              style={{ boxShadow: `inset 0 0 0 1px ${agent.accent}20` }}
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: agent.accent }}
                  />
                  <div>
                    <p className="text-sm font-semibold text-slate-100">
                      {agent.name}
                    </p>
                    <p className="text-xs text-slate-400">{agent.role}</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onRemoveAgent(agent.id)}
                  disabled={disabled || agents.length === 1}
                  className="rounded-full border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:border-rose-400/30 hover:bg-rose-400/10 hover:text-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label={`Remove ${agent.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

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

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Provider">
                    <select
                      className={inputClassName()}
                      value={agent.provider}
                      onChange={(event) =>
                        (() => {
                          const nextProvider = event.target.value as AgentConfig["provider"];
                          onAgentChange(agent.id, "provider", nextProvider);
                          onAgentChange(
                            agent.id,
                            "model",
                            getDefaultModel(nextProvider),
                          );
                        })()
                      }
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

                <div className="rounded-xl border border-white/8 bg-white/4 px-3 py-2 text-xs text-slate-300">
                  <p className="font-medium text-slate-100">{providerEntry.label}</p>
                  <p className="mt-1 text-slate-400">
                    {providerEntry.description}
                  </p>
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
                    className={`${inputClassName()} min-h-24 resize-y`}
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
            })()
          ))}
        </div>
      </div>
    </div>
  );
}
