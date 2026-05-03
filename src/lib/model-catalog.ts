import type { ProviderId } from "@/lib/types";

export type ModelCatalogEntry = {
  id: string;
  label: string;
  description: string;
};

export type ProviderCatalogEntry = {
  id: ProviderId;
  label: string;
  description: string;
  envVar?: string;
  models: ModelCatalogEntry[];
};

export type ProviderReadinessStatus = "mock" | "configured" | "missing-key" | "offline";

export type ProviderHealthEntry = {
  providerId: ProviderId;
  envVar?: string;
  configured: boolean;
  status: ProviderReadinessStatus;
};

export const providerCatalog: Record<ProviderId, ProviderCatalogEntry> = {
  mock: {
    id: "mock",
    label: "Mock",
    description: "Deterministic local fallback for demos and UI iteration.",
    models: [
      {
        id: "demo-dispatcher",
        label: "Demo Dispatcher",
        description: "Mock dispatcher for local orchestration flows.",
      },
      {
        id: "demo-product",
        label: "Demo Product",
        description: "Mock product specialist output.",
      },
      {
        id: "demo-architect",
        label: "Demo Architect",
        description: "Mock architecture specialist output.",
      },
      {
        id: "demo-ux",
        label: "Demo UX",
        description: "Mock UX specialist output.",
      },
      {
        id: "demo-specialist",
        label: "Demo Specialist",
        description: "Generic mock specialist output.",
      },
    ],
  },
  ollama: {
    id: "ollama",
    label: "Ollama",
    description:
      "Local Ollama models through the OpenAI-compatible endpoint on 127.0.0.1:11434/v1.",
    envVar: "OLLAMA_BASE_URL",
    models: [
      {
        id: "llama3.2",
        label: "llama3.2",
        description: "Common local default for general-purpose local runs.",
      },
      {
        id: "qwen3",
        label: "qwen3",
        description: "Strong local reasoning option when available in Ollama.",
      },
      {
        id: "phi4-mini",
        label: "phi4-mini",
        description: "Compact local model option for lighter workflows.",
      },
    ],
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    description: "OpenAI chat models for dispatcher and worker execution.",
    envVar: "OPENAI_API_KEY",
    models: [
      {
        id: "gpt-4.1",
        label: "GPT-4.1",
        description: "Balanced reasoning model for core orchestration.",
      },
      {
        id: "gpt-4.1-mini",
        label: "GPT-4.1 Mini",
        description: "Cheaper/faster OpenAI option for workers.",
      },
      {
        id: "gpt-4o",
        label: "GPT-4o",
        description: "General-purpose multimodal-capable OpenAI model.",
      },
      {
        id: "gpt-4o-mini",
        label: "GPT-4o Mini",
        description: "Lower-cost OpenAI model for lighter tasks.",
      },
    ],
  },
  anthropic: {
    id: "anthropic",
    label: "Anthropic",
    description: "Claude models for long-form reasoning and writing.",
    envVar: "ANTHROPIC_API_KEY",
    models: [
      {
        id: "claude-sonnet-4-6",
        label: "Claude Sonnet 4.6",
        description: "Strong writing and reasoning model for specialists.",
      },
      {
        id: "claude-sonnet-4-5",
        label: "Claude Sonnet 4.5",
        description: "Stable Claude Sonnet option for specialist tasks.",
      },
      {
        id: "claude-haiku-4-5",
        label: "Claude Haiku 4.5",
        description: "Faster Anthropic model for lightweight tasks.",
      },
    ],
  },
  google: {
    id: "google",
    label: "Google",
    description: "Gemini models for fast synthesis and design ideation.",
    envVar: "GOOGLE_GENERATIVE_AI_API_KEY",
    models: [
      {
        id: "gemini-2.5-pro",
        label: "Gemini 2.5 Pro",
        description: "Higher-end Gemini option for reasoning-heavy tasks.",
      },
      {
        id: "gemini-2.5-flash",
        label: "Gemini 2.5 Flash",
        description: "Balanced Gemini model for general worker tasks.",
      },
      {
        id: "gemini-2.0-flash",
        label: "Gemini 2.0 Flash",
        description: "Fast Gemini option for lightweight runs.",
      },
    ],
  },
};

export const providerOptions = Object.values(providerCatalog).map((provider) => ({
  value: provider.id,
  label: provider.label,
}));

export function getProviderEntry(providerId: ProviderId): ProviderCatalogEntry {
  return providerCatalog[providerId];
}

export function getProviderModels(providerId: ProviderId): ModelCatalogEntry[] {
  return providerCatalog[providerId].models;
}

export function getDefaultModel(providerId: ProviderId): string {
  return providerCatalog[providerId].models[0]?.id ?? "demo-specialist";
}

export function getDefaultProviderModelsById(): Record<ProviderId, ModelCatalogEntry[]> {
  return {
    mock: [...providerCatalog.mock.models],
    ollama: [...providerCatalog.ollama.models],
    openai: [...providerCatalog.openai.models],
    anthropic: [...providerCatalog.anthropic.models],
    google: [...providerCatalog.google.models],
  };
}

export function isSupportedModel(providerId: ProviderId, modelId: string): boolean {
  return providerCatalog[providerId].models.some((model) => model.id === modelId);
}

export function getModelEntry(
  providerId: ProviderId,
  modelId: string,
): ModelCatalogEntry | undefined {
  return providerCatalog[providerId].models.find((model) => model.id === modelId);
}

export function getDefaultProviderHealth(): Record<ProviderId, ProviderHealthEntry> {
  return {
    mock: {
      providerId: "mock",
      configured: true,
      status: "mock",
    },
    ollama: {
      providerId: "ollama",
      envVar: providerCatalog.ollama.envVar,
      configured: false,
      status: "offline",
    },
    openai: {
      providerId: "openai",
      envVar: providerCatalog.openai.envVar,
      configured: false,
      status: "missing-key",
    },
    anthropic: {
      providerId: "anthropic",
      envVar: providerCatalog.anthropic.envVar,
      configured: false,
      status: "missing-key",
    },
    google: {
      providerId: "google",
      envVar: providerCatalog.google.envVar,
      configured: false,
      status: "missing-key",
    },
  };
}
