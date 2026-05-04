import {
  ORCHESTRATION_EVENT_SCHEMA_VERSION,
  orchestrationRequestSchema,
  type OrchestrationEvent,
} from "@/lib/types";
import { runOrchestration } from "@/lib/orchestrator";
import { logServerEvent } from "@/lib/server-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

function buildTraceHeaders(requestId: string, runId?: string): HeadersInit {
  return {
    "X-Request-Id": requestId,
    ...(runId ? { "X-Run-Id": runId } : {}),
  };
}

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
      return nextEvent;
    case "dispatcher-plan":
      nextEvent.summary = truncateText(nextEvent.summary);
      nextEvent.input = truncateText(nextEvent.input);
      return nextEvent;
    case "task-assignment":
      nextEvent.detail = truncateText(nextEvent.detail);
      return nextEvent;
    case "node-chunk":
      nextEvent.title = truncateText(nextEvent.title);
      nextEvent.detail = truncateText(nextEvent.detail);
      nextEvent.input = truncateText(nextEvent.input);
      return nextEvent;
    case "agent-result":
      nextEvent.input = truncateText(nextEvent.input);
      return nextEvent;
    case "final-response":
      nextEvent.input = truncateText(nextEvent.input);
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
  const requestId = request.headers.get("x-request-id")?.trim() || createId("req");
  let payload: unknown;

  try {
    payload = await request.json();
  } catch (error) {
    logServerEvent("warn", "orchestration.invalid_json", {
      requestId,
      message: serializeError(error),
    });
    return Response.json(
      {
        error: "Invalid JSON payload.",
        errorCode: "invalid-json",
        message: serializeError(error),
      },
      {
        status: 400,
        headers: buildTraceHeaders(requestId),
      },
    );
  }

  const parsed = orchestrationRequestSchema.safeParse(payload);

  if (!parsed.success) {
    logServerEvent("warn", "orchestration.invalid_request", {
      requestId,
      issueCount: parsed.error.issues.length,
    });
    return Response.json(
      {
        error: "Invalid request payload.",
        errorCode: "invalid-request",
        issues: parsed.error.flatten(),
      },
      {
        status: 400,
        headers: buildTraceHeaders(requestId),
      },
    );
  }

  const runId = createId("run");
  const startedAt = Date.now();
  let eventCount = 0;
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  const writeEvent = async (event: OrchestrationEvent) => {
    const sanitizedEvent = sanitizeEvent(event);
    eventCount += 1;

    if (sanitizedEvent.type === "provider-warning") {
      logServerEvent("warn", "orchestration.provider_warning", {
        requestId,
        runId,
        nodeId: sanitizedEvent.nodeId,
        provider: sanitizedEvent.provider.effectiveProvider,
        model: sanitizedEvent.provider.effectiveModel,
      });
    } else if (sanitizedEvent.type === "run-complete") {
      logServerEvent("info", "orchestration.completed", {
        requestId,
        runId,
        eventCount,
        durationMs: Date.now() - startedAt,
      });
    } else if (sanitizedEvent.type === "run-cancelled") {
      logServerEvent("warn", "orchestration.cancelled", {
        requestId,
        runId,
        eventCount,
        durationMs: Date.now() - startedAt,
        errorCode: sanitizedEvent.errorCode ?? "run-cancelled",
      });
    } else if (sanitizedEvent.type === "run-error") {
      logServerEvent("error", "orchestration.failed", {
        requestId,
        runId,
        nodeId: sanitizedEvent.nodeId,
        eventCount,
        durationMs: Date.now() - startedAt,
        errorCode: sanitizedEvent.errorCode ?? "internal-error",
        message: sanitizedEvent.message,
      });
    }

    await writer.write(encoder.encode(`${JSON.stringify(sanitizedEvent)}\n`));
  };

  logServerEvent("info", "orchestration.accepted", {
    requestId,
    runId,
    messageCount: parsed.data.messages.length,
    agentCount: parsed.data.agents.length,
  });

  void (async () => {
    try {
      await runOrchestration(parsed.data, writeEvent, {
        abortSignal: request.signal,
        runId,
      });
    } catch (error) {
      logServerEvent("error", "orchestration.route_crash", {
        requestId,
        runId,
        durationMs: Date.now() - startedAt,
        message: serializeError(error),
      });
      await writeEvent({
        schemaVersion: ORCHESTRATION_EVENT_SCHEMA_VERSION,
        type: "run-error",
        eventId: createId("evt"),
        runId,
        timestamp: new Date().toISOString(),
        nodeId: "dispatcher",
        errorCode: "internal-error",
        message: serializeError(error),
      });
    } finally {
      logServerEvent("info", "orchestration.stream_closed", {
        requestId,
        runId,
        eventCount,
        durationMs: Date.now() - startedAt,
      });
      await writer.close();
    }
  })();

  return new Response(stream.readable, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      ...buildTraceHeaders(requestId, runId),
      "X-Orchestration-Event-Schema-Version": String(
        ORCHESTRATION_EVENT_SCHEMA_VERSION,
      ),
    },
  });
}
