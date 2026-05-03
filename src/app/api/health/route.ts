import { buildRuntimeHealthReport } from "@/lib/runtime-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return Response.json(buildRuntimeHealthReport(), {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
