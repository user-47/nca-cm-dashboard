import pino from "pino";
import { config } from "./config";

/**
 * Structured logs. Every render emits one line carrying enough to reproduce
 * it: which poster, which brand, which template, what size, how long, how big.
 * When a render looks wrong three days later, that line is the evidence.
 */
export const logger = pino({
  level: config().LOG_LEVEL,
  ...(config().NODE_ENV === "development"
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "HH:MM:ss" },
        },
      }
    : {}),
  redact: {
    paths: ["req.headers.authorization", "*.S3_SECRET_KEY", "*.ANTHROPIC_API_KEY"],
    remove: true,
  },
});
