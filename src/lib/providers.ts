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
  mock: () => string;
};

type ObjectRequest<T> = {
  selection: LlmSelection;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  schemaName: string;
  mock: () => T;
};

function pause(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  mock,
}: TextRequest): Promise<{ text: string; meta: ProviderExecutionMeta }> {
  const resolved = resolveLanguageModel(selection);

  if (resolved.kind === "mock") {
    await pause(280);
    return { text: mock(), meta: resolved.meta };
  }

  const result = await generateText({
    model: resolved.model,
    system,
    prompt,
    temperature: selection.temperature,
  });

  return { text: result.text, meta: resolved.meta };
}

export async function generateStructuredObject<T>({
  selection,
  system,
  prompt,
  schema,
  schemaName,
  mock,
}: ObjectRequest<T>): Promise<{ object: T; meta: ProviderExecutionMeta }> {
  const resolved = resolveLanguageModel(selection);

  if (resolved.kind === "mock") {
    await pause(360);
    return { object: mock(), meta: resolved.meta };
  }

  const result = await generateObject({
    model: resolved.model,
    system,
    prompt,
    schema,
    schemaName,
    temperature: selection.temperature,
  });

  return { object: result.object, meta: resolved.meta };
}
