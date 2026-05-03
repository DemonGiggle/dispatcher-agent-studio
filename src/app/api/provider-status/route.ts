import { buildProviderHealth, buildProviderModels } from "@/lib/runtime-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const [providers, providerModels] = await Promise.all([
    buildProviderHealth(),
    buildProviderModels(),
  ]);

  return Response.json({
    providers,
    providerModels,
  }, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
