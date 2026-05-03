"use client";

import { ArrowUpRight, LoaderCircle, Sparkles } from "lucide-react";

import type { ConversationMessage } from "@/lib/types";

type ChatPanelProps = {
  draft: string;
  messages: ConversationMessage[];
  samplePrompts: string[];
  isRunning: boolean;
  statusText: string;
  errorText?: string;
  onDraftChange: (value: string) => void;
  onSubmit: () => void;
  onPickPrompt: (prompt: string) => void;
};

export function ChatPanel({
  draft,
  messages,
  samplePrompts,
  isRunning,
  statusText,
  errorText,
  onDraftChange,
  onSubmit,
  onPickPrompt,
}: ChatPanelProps) {
  return (
    <div className="flex h-full flex-col gap-4">
      <div className="rounded-[28px] border border-white/10 bg-slate-950/70 p-5 shadow-2xl shadow-slate-950/30">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-50">
              Dispatcher chat
            </h2>
            <p className="text-xs text-slate-400">
              One prompt in, multi-agent breakdown out.
            </p>
          </div>
          <div className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1.5 text-xs text-cyan-100">
            {statusText}
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {samplePrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => onPickPrompt(prompt)}
              disabled={isRunning}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200 transition hover:border-cyan-400/30 hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {prompt}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <div className="flex max-h-[520px] min-h-[520px] flex-col gap-3 overflow-auto rounded-3xl border border-white/10 bg-slate-900/60 p-4">
            {messages.map((message) => {
              const isAssistant = message.role === "assistant";

              return (
                <article
                  key={message.id}
                  className={`max-w-[88%] rounded-3xl border px-4 py-3 ${
                    isAssistant
                      ? "border-cyan-400/20 bg-cyan-400/10 text-slate-100"
                      : "ml-auto border-emerald-400/20 bg-emerald-400/10 text-emerald-50"
                  }`}
                >
                  <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-slate-400">
                    {isAssistant ? (
                      <Sparkles className="h-3.5 w-3.5" />
                    ) : (
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    )}
                    {isAssistant ? "Dispatcher" : "User"}
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-7">
                    {message.content}
                  </p>
                </article>
              );
            })}

            {isRunning ? (
              <div className="max-w-[88%] rounded-3xl border border-cyan-400/20 bg-cyan-400/8 px-4 py-3 text-slate-200">
                <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-cyan-200">
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  Dispatcher working
                </div>
                <p className="text-sm text-slate-300">{statusText}</p>
              </div>
            ) : null}
          </div>

          {errorText ? (
            <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
              {errorText}
            </div>
          ) : null}

          <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-4">
            <textarea
              className="min-h-32 w-full resize-y bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500"
              placeholder="Describe the task you want the dispatcher to decompose..."
              value={draft}
              onChange={(event) => onDraftChange(event.target.value)}
              disabled={isRunning}
            />

            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-xs text-slate-500">
                The dispatcher will plan, route, collect reports, and synthesize the
                answer.
              </p>
              <button
                type="button"
                onClick={onSubmit}
                disabled={isRunning || draft.trim().length === 0}
                className="inline-flex items-center gap-2 rounded-full bg-cyan-400 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
              >
                {isRunning ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowUpRight className="h-4 w-4" />
                )}
                Dispatch
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
