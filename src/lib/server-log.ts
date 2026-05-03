type LogLevel = "debug" | "info" | "warn" | "error";

type LogFields = Record<string, boolean | number | string | null | undefined>;

const logLevelSeverity: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function resolveLogLevel(): LogLevel {
  const candidate = process.env.LOG_LEVEL?.toLowerCase();

  switch (candidate) {
    case "debug":
    case "info":
    case "warn":
    case "error":
      return candidate;
    default:
      return "info";
  }
}

function shouldLog(level: LogLevel): boolean {
  return logLevelSeverity[level] >= logLevelSeverity[resolveLogLevel()];
}

export function logServerEvent(
  level: LogLevel,
  event: string,
  fields: LogFields = {},
) {
  if (!shouldLog(level)) {
    return;
  }

  const payload = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    service: "dispatcher-agent-studio",
    ...fields,
  });

  if (level === "warn") {
    console.warn(payload);
    return;
  }

  if (level === "error") {
    console.error(payload);
    return;
  }

  console.info(payload);
}
