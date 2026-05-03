import {
  getDefaultProviderModelsById,
  getDefaultProviderHealth,
  providerCatalog,
  type ModelCatalogEntry,
  type ProviderHealthEntry,
} from "@/lib/model-catalog";
import { fetchOllamaModels } from "@/lib/provider-runtime";
import {
  ORCHESTRATION_EVENT_SCHEMA_VERSION,
  providerIds,
  type ProviderId,
} from "@/lib/types";

export type ProviderHealthMap = Record<ProviderId, ProviderHealthEntry>;
export type ProviderModelMap = Record<ProviderId, ModelCatalogEntry[]>;

export type RuntimeHealthReport = {
  status: "ok";
  service: "dispatcher-agent-studio";
  deploymentTarget: "vercel";
  runtime: "nodejs";
  timestamp: string;
  schemaVersion: typeof ORCHESTRATION_EVENT_SCHEMA_VERSION;
  providers: ProviderHealthMap;
  checks: {
    mockFallbackAvailable: boolean;
    configuredLiveProviders: number;
    allProviderEntriesPresent: boolean;
  };
};

export async function buildProviderHealth(): Promise<ProviderHealthMap> {
  const health = getDefaultProviderHealth();

  for (const providerId of providerIds) {
    if (providerId === "mock") {
      continue;
    }

    if (providerId === "ollama") {
      const envVar = providerCatalog.ollama.envVar;

      try {
        await fetchOllamaModels();
        health.ollama = {
          providerId: "ollama",
          envVar,
          configured: true,
          status: "configured",
        };
      } catch {
        health.ollama = {
          providerId: "ollama",
          envVar,
          configured: false,
          status: "offline",
        };
      }

      continue;
    }

    const envVar = providerCatalog[providerId].envVar;
    const configured = Boolean(envVar && process.env[envVar]);

    health[providerId] = {
      providerId,
      envVar,
      configured,
      status: configured ? "configured" : "missing-key",
    };
  }

  return health;
}

export async function buildRuntimeHealthReport(): Promise<RuntimeHealthReport> {
  const providers = await buildProviderHealth();
  const configuredLiveProviders = providerIds.reduce((count, providerId) => {
    if (providerId === "mock") {
      return count;
    }

    return count + (providers[providerId].configured ? 1 : 0);
  }, 0);

  return {
    status: "ok",
    service: "dispatcher-agent-studio",
    deploymentTarget: "vercel",
    runtime: "nodejs",
    timestamp: new Date().toISOString(),
    schemaVersion: ORCHESTRATION_EVENT_SCHEMA_VERSION,
    providers,
    checks: {
      mockFallbackAvailable: providers.mock.configured,
      configuredLiveProviders,
      allProviderEntriesPresent: providerIds.every((providerId) =>
        Object.hasOwn(providers, providerId),
      ),
    },
  };
}

export async function buildProviderModels(): Promise<ProviderModelMap> {
  const providerModels = getDefaultProviderModelsById();

  try {
    const ollamaModels = await fetchOllamaModels();

    if (ollamaModels.length > 0) {
      providerModels.ollama = ollamaModels;
    }
  } catch {
    // Keep the static Ollama defaults when the local runtime is unavailable.
  }

  return providerModels;
}
