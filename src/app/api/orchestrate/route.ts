import { orchestrationRequestSchema, type OrchestrationEvent } from "@/lib/types";
import { runOrchestration } from "@/lib/orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function createId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function serializeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown orchestration error.";
}

export async function POST(request: Request): Promise<Response> {
  const payload = await request.json();
  const parsed = orchestrationRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return Response.json(
      {
        error: "Invalid request payload.",
        issues: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  const writeEvent = async (event: OrchestrationEvent) => {
    await writer.write(encoder.encode(`${JSON.stringify(event)}\n`));
  };

  void (async () => {
    try {
      await runOrchestration(parsed.data, writeEvent, {
        abortSignal: request.signal,
      });
    } catch (error) {
      await writeEvent({
        type: "run-error",
        eventId: createId("evt"),
        runId: createId("run"),
        timestamp: new Date().toISOString(),
        nodeId: "dispatcher",
        message: serializeError(error),
      });
    } finally {
      await writer.close();
    }
  })();

  return new Response(stream.readable, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
