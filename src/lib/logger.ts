import pino from "pino";

// Structured JSON logs, request-id correlated via pino-http in app.ts.
// Constitution: Observability (cross-cutting concern, backend HLD).
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
});
