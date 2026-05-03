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

const MAX_EVENT_TEXT_CHARS = 5_000;

function truncateText(value: string): string {
  if (value.length <= MAX_EVENT_TEXT_CHARS) {
    return value;
  }

  return `${value.slice(0, MAX_EVENT_TEXT_CHARS)}… [truncated ${value.length - MAX_EVENT_TEXT_CHARS} chars]`;
}

function sanitizeEvent(event: OrchestrationEvent): OrchestrationEvent {
  const nextEvent = structuredClone(event);

  switch (nextEvent.type) {
    case "run-start":
      nextEvent.prompt = truncateText(nextEvent.prompt);
      return nextEvent;
    case "node-status":
      nextEvent.detail = truncateText(nextEvent.detail);
      nextEvent.input = nextEvent.input ? truncateText(nextEvent.input) : nextEvent.input;
      nextEvent.output = nextEvent.output ? truncateText(nextEvent.output) : nextEvent.output;
      return nextEvent;
    case "dispatcher-plan":
      nextEvent.summary = truncateText(nextEvent.summary);
      nextEvent.input = truncateText(nextEvent.input);
      nextEvent.output = truncateText(nextEvent.output);
      return nextEvent;
    case "agent-result":
      nextEvent.input = truncateText(nextEvent.input);
      nextEvent.output = truncateText(nextEvent.output);
      return nextEvent;
    case "final-response":
      nextEvent.response = truncateText(nextEvent.response);
      nextEvent.input = truncateText(nextEvent.input);
      nextEvent.output = truncateText(nextEvent.output);
      return nextEvent;
    case "provider-warning":
      nextEvent.message = truncateText(nextEvent.message);
      return nextEvent;
    case "run-cancelled":
    case "run-error":
    case "run-complete":
      nextEvent.message = truncateText(nextEvent.message);
      return nextEvent;
  }
}

export async function POST(request: Request): Promise<Response> {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch (error) {
    return Response.json(
      {
        error: "Invalid JSON payload.",
        errorCode: "invalid-json",
        message: serializeError(error),
      },
      { status: 400 },
    );
  }

  const parsed = orchestrationRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return Response.json(
      {
        error: "Invalid request payload.",
        errorCode: "invalid-request",
        issues: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  const writeEvent = async (event: OrchestrationEvent) => {
    await writer.write(encoder.encode(`${JSON.stringify(sanitizeEvent(event))}\n`));
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
        errorCode: "internal-error",
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
