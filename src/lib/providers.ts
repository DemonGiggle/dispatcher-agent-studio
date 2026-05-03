import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { generateObject, generateText, streamText } from "ai";
import { z } from "zod";

import { getProviderEntry, isSupportedModel } from "@/lib/model-catalog";
import {
  fetchOllamaModels,
  getOllamaApiKey,
  getOllamaBaseURL,
} from "@/lib/provider-runtime";
import type {
  LlmSelection,
  OrchestrationErrorCode,
  ProviderExecutionMeta,
  ProviderId,
} from "@/lib/types";

const providerEnvVars: Record<Exclude<ProviderId, "mock" | "ollama">, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
};

type SupportedModel = Parameters<typeof generateText>[0]["model"];

export class ProviderExecutionError extends Error {
  constructor(
    readonly code: OrchestrationErrorCode,
    readonly provider: ProviderId,
    readonly model: string,
    message: string,
  ) {
    super(message);
    this.name = "ProviderExecutionError";
  }
}

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
  onChunk?: (
    chunk: string,
    aggregate: string,
    meta: ProviderExecutionMeta,
  ) => Promise<void> | void;
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

export function isProviderExecutionError(
  error: unknown,
): error is ProviderExecutionError {
  return error instanceof ProviderExecutionError;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string" && error.length > 0) {
    return error;
  }

  return "Unknown provider error.";
}

function extractStatusCode(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  const candidate = Reflect.get(error, "statusCode");

  return typeof candidate === "number" ? candidate : undefined;
}

function classifyProviderError(
  error: unknown,
  selection: LlmSelection,
): ProviderExecutionError {
  const message = errorMessage(error);
  const statusCode = extractStatusCode(error);
  const normalized = message.toLowerCase();
  let code: OrchestrationErrorCode = "provider-service";

  if (statusCode === 401 || statusCode === 403) {
    code = "provider-auth";
  } else if (
    statusCode === 429 &&
    /(quota|billing|insufficient|credit|limit reached)/i.test(message)
  ) {
    code = "provider-quota";
  } else if (statusCode === 429) {
    code = "provider-rate-limit";
  } else if (
    /(timed out|timeout|deadline exceeded|time limit|request timed out)/i.test(
      normalized,
    )
  ) {
    code = "provider-timeout";
  } else if (
    /(json|schema|parse|invalid response|malformed|unexpected response)/i.test(
      normalized,
    )
  ) {
    code = "provider-malformed-response";
  } else if (typeof statusCode === "number" && statusCode >= 500) {
    code = "provider-service";
  }

  return new ProviderExecutionError(
    code,
    selection.provider,
    selection.model,
    `Provider ${selection.provider}/${selection.model} failed: ${message}`,
  );
}

function assertSupportedModelSelection(selection: LlmSelection) {
  if (selection.provider === "ollama") {
    return;
  }

  if (isSupportedModel(selection.provider, selection.model)) {
    return;
  }

  const providerEntry = getProviderEntry(selection.provider);

  throw new ProviderExecutionError(
    "unsupported-model",
    selection.provider,
    selection.model,
    `Provider ${providerEntry.label} does not support model "${selection.model}". Choose one of the registered models in the provider catalog.`,
  );
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

async function resolveLanguageModel(
  selection: LlmSelection,
  abortSignal?: AbortSignal,
): Promise<ResolvedModel> {
  assertSupportedModelSelection(selection);

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

  if (selection.provider === "ollama") {
    try {
      const availableModels = await fetchOllamaModels({ signal: abortSignal });

      if (
        availableModels.length > 0 &&
        !availableModels.some((model) => model.id === selection.model)
      ) {
        throw new ProviderExecutionError(
          "unsupported-model",
          selection.provider,
          selection.model,
          `Ollama does not currently expose model "${selection.model}". Pick one of the locally available models or pull it into Ollama first.`,
        );
      }

      return {
        kind: "live",
        model: createOpenAI({
          apiKey: getOllamaApiKey(),
          baseURL: getOllamaBaseURL(),
          name: "ollama",
        })(selection.model),
        meta: {
          requestedProvider: selection.provider,
          requestedModel: selection.model,
          effectiveProvider: selection.provider,
          effectiveModel: selection.model,
          mode: "live",
        },
      };
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }

      if (isProviderExecutionError(error)) {
        throw error;
      }

      return {
        kind: "mock",
        meta: {
          requestedProvider: selection.provider,
          requestedModel: selection.model,
          effectiveProvider: "mock",
          effectiveModel: `mock:${selection.model}`,
          mode: "mock",
          warning: `Ollama is not reachable at ${getOllamaBaseURL()}. Falling back to the mock provider for this run.`,
        },
      };
    }
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

function splitMockStream(text: string, maxChunkLength = 96): string[] {
  if (text.length <= maxChunkLength) {
    return [text];
  }

  const chunks: string[] = [];

  for (let index = 0; index < text.length; index += maxChunkLength) {
    chunks.push(text.slice(index, index + maxChunkLength));
  }

  return chunks;
}

export async function generatePlainText({
  selection,
  system,
  prompt,
  abortSignal,
  timeoutMs,
  mock,
  onChunk,
}: TextRequest): Promise<{ text: string; meta: ProviderExecutionMeta }> {
  const resolved = await resolveLanguageModel(selection, abortSignal);

  if (resolved.kind === "mock") {
    const text = mock();

    if (!onChunk) {
      await pause(280, abortSignal);
      return { text, meta: resolved.meta };
    }

    let aggregate = "";

    for (const chunk of splitMockStream(text)) {
      await pause(45, abortSignal);
      aggregate += chunk;
      await onChunk(chunk, aggregate, resolved.meta);
    }

    return { text, meta: resolved.meta };
  }

  try {
    if (!onChunk) {
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

    const result = streamText({
      model: resolved.model,
      system,
      prompt,
      temperature: selection.temperature,
      abortSignal,
      timeout: timeoutMs,
    });

    let text = "";

    for await (const chunk of result.textStream) {
      text += chunk;
      await onChunk(chunk, text, resolved.meta);
    }

    return { text, meta: resolved.meta };
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    throw classifyProviderError(error, selection);
  }
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
  const resolved = await resolveLanguageModel(selection, abortSignal);

  if (resolved.kind === "mock") {
    await pause(360, abortSignal);
    return { object: mock(), meta: resolved.meta };
  }

  try {
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
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    throw classifyProviderError(error, selection);
  }
}
