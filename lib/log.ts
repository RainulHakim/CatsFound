import "server-only";
import pino from "pino";

/** Structured JSON logger. The only sanctioned way to log from server code. */
export const log = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: "catfound" },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      "email",
      "*.email",
      "secret",
      "*.secret",
      "token",
      "*.token",
      "password",
      "*.password",
      "headers.cookie",
      "headers.authorization",
    ],
    censor: "[redacted]",
  },
});
