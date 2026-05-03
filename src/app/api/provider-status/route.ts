import {
  getDefaultProviderHealth,
  providerCatalog,
  type ProviderHealthEntry,
} from "@/lib/model-catalog";
import { providerIds, type ProviderId } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function buildProviderHealth(): Record<ProviderId, ProviderHealthEntry> {
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

export async function GET(): Promise<Response> {
  return Response.json({
    providers: buildProviderHealth(),
  });
}
