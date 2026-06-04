import pino from "pino";

export function createLogger(options?: { level?: string }): pino.Logger {
  return pino({
    level: options?.level ?? "info",
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:standard",
        ignore: "pid,hostname",
      },
    },
  });
}
