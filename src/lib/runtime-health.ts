import {
  getDefaultProviderHealth,
  providerCatalog,
  type ProviderHealthEntry,
} from "@/lib/model-catalog";
import {
  ORCHESTRATION_EVENT_SCHEMA_VERSION,
  providerIds,
  type ProviderId,
} from "@/lib/types";

export type ProviderHealthMap = Record<ProviderId, ProviderHealthEntry>;

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

export function buildProviderHealth(): ProviderHealthMap {
  const health = getDefaultProviderHealth();

  for (const providerId of providerIds) {
    if (providerId === "mock") {
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

export function buildRuntimeHealthReport(): RuntimeHealthReport {
  const providers = buildProviderHealth();
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
