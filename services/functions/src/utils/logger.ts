import * as winston from "winston";
import { env } from "../config/env";

const { combine, timestamp, errors, json, colorize, simple } = winston.format;

const devFormat = combine(
  colorize({ all: true }),
  timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  errors({ stack: true }),
  simple()
);

const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  json()
);

export const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  format: env.NODE_ENV === "production" ? prodFormat : devFormat,
  defaultMeta: {
    service: "cross-border-payment",
    environment: env.APP_ENV,
  },
  transports: [new winston.transports.Console()],
  exitOnError: false,
});

export function createContextLogger(
  context: Record<string, unknown>
): winston.Logger {
  return logger.child(context);
}

export type Logger = winston.Logger;
