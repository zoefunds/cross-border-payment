import winston from "winston";

// ─── Log format ───────────────────────────────────────────────────────────────
// JSON in production (parseable by Cloud Logging, Datadog, etc.)
// Human-readable in development
const isDev = process.env.NODE_ENV !== "production";

const devFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: "HH:mm:ss" }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr =
      Object.keys(meta).length > 0
        ? "\n" + JSON.stringify(meta, null, 2)
        : "";
    return `[${timestamp}] ${level}: ${message}${metaStr}`;
  })
);

const prodFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? "info",
  format: isDev ? devFormat : prodFormat,
  transports: [new winston.transports.Console()],
});