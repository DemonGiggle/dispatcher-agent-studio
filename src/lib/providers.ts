import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { generateObject, generateText } from "ai";
import { z } from "zod";

import type { LlmSelection, ProviderExecutionMeta, ProviderId } from "@/lib/types";

const providerEnvVars: Record<Exclude<ProviderId, "mock">, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
};

type SupportedModel = Parameters<typeof generateText>[0]["model"];

type ResolvedModel =
  | {
      kind: "live";
      model: SupportedModel;
      meta: ProviderExecutionMeta;
    }
  | {
      kind: "mock";
      meta: ProviderExecutionMeta;
    };

type TextRequest = {
  selection: LlmSelection;
  system: string;
  prompt: string;
  abortSignal?: AbortSignal;
  timeoutMs?: number;
  mock: () => string;
};

type ObjectRequest<T> = {
  selection: LlmSelection;
  system: string;
  prompt: string;
  abortSignal?: AbortSignal;
  timeoutMs?: number;
  schema: z.ZodType<T>;
  schemaName: string;
  mock: () => T;
};

export function createAbortError(message = "The operation was aborted.") {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function getAbortReason(signal: AbortSignal, fallbackMessage: string) {
  if (signal.reason instanceof Error) {
    return signal.reason.name === "AbortError"
      ? signal.reason
      : createAbortError(signal.reason.message);
  }

  if (typeof signal.reason === "string" && signal.reason.length > 0) {
    return createAbortError(signal.reason);
  }

  return createAbortError(fallbackMessage);
}

function pause(ms: number, signal?: AbortSignal) {
  if (signal?.aborted) {
    return Promise.reject(getAbortReason(signal, "The operation was aborted."));
  }

  return new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      signal?.removeEventListener("abort", handleAbort);
      resolve();
    }, ms);

    function handleAbort() {
      clearTimeout(timeoutId);
      signal?.removeEventListener("abort", handleAbort);
      reject(getAbortReason(signal!, "The operation was aborted."));
    }

    signal?.addEventListener("abort", handleAbort, { once: true });
  });
}

function resolveLanguageModel(selection: LlmSelection): ResolvedModel {
  if (selection.provider === "mock") {
    return {
      kind: "mock",
      meta: {
        requestedProvider: selection.provider,
        requestedModel: selection.model,
        effectiveProvider: "mock",
        effectiveModel: selection.model,
        mode: "mock",
      },
    };
  }

  const envVar = providerEnvVars[selection.provider];
  const apiKey = process.env[envVar];

  if (!apiKey) {
    return {
      kind: "mock",
      meta: {
        requestedProvider: selection.provider,
        requestedModel: selection.model,
        effectiveProvider: "mock",
        effectiveModel: `mock:${selection.model}`,
        mode: "mock",
        warning: `${envVar} is not set. Falling back to the mock provider for this run.`,
      },
    };
  }

  switch (selection.provider) {
    case "openai":
      return {
        kind: "live",
        model: createOpenAI({ apiKey })(selection.model),
        meta: {
          requestedProvider: selection.provider,
          requestedModel: selection.model,
          effectiveProvider: selection.provider,
          effectiveModel: selection.model,
          mode: "live",
        },
      };
    case "anthropic":
      return {
        kind: "live",
        model: createAnthropic({ apiKey })(selection.model),
        meta: {
          requestedProvider: selection.provider,
          requestedModel: selection.model,
          effectiveProvider: selection.provider,
          effectiveModel: selection.model,
          mode: "live",
        },
      };
    case "google":
      return {
        kind: "live",
        model: createGoogleGenerativeAI({ apiKey })(selection.model),
        meta: {
          requestedProvider: selection.provider,
          requestedModel: selection.model,
          effectiveProvider: selection.provider,
          effectiveModel: selection.model,
          mode: "live",
        },
      };
  }
}

export async function generatePlainText({
  selection,
  system,
  prompt,
  abortSignal,
  timeoutMs,
  mock,
}: TextRequest): Promise<{ text: string; meta: ProviderExecutionMeta }> {
  const resolved = resolveLanguageModel(selection);

  if (resolved.kind === "mock") {
    await pause(280, abortSignal);
    return { text: mock(), meta: resolved.meta };
  }

  const result = await generateText({
    model: resolved.model,
    system,
    prompt,
    temperature: selection.temperature,
    abortSignal,
    timeout: timeoutMs,
  });

  return { text: result.text, meta: resolved.meta };
}

export async function generateStructuredObject<T>({
  selection,
  system,
  prompt,
  abortSignal,
  timeoutMs,
  schema,
  schemaName,
  mock,
}: ObjectRequest<T>): Promise<{ object: T; meta: ProviderExecutionMeta }> {
  const resolved = resolveLanguageModel(selection);

  if (resolved.kind === "mock") {
    await pause(360, abortSignal);
    return { object: mock(), meta: resolved.meta };
  }

  const result = await generateObject({
    model: resolved.model,
    system,
    prompt,
    schema,
    schemaName,
    temperature: selection.temperature,
    abortSignal,
    timeout: timeoutMs,
  });

  return { object: result.object, meta: resolved.meta };
}
