import * as winston from "winston";
import { env } from "../config/env";

const { combine, timestamp, errors, json } = winston.format;

// Always use JSON format — avoids "error:" prefix that Firebase CLI intercepts
const logFormat = combine(
  timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  errors({ stack: true }),
  json()
);

export const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  format: logFormat,
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
