import { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/errors";
import { logger } from "../utils/logger";
import { env } from "../config/env";

export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  logger.error("Unhandled error", {
    error: { name: error.name, message: error.message, stack: error.stack },
    request: { method: req.method, path: req.path, ip: req.ip },
  });

  if (error instanceof AppError && error.isOperational) {
    res.status(error.statusCode).json({
      success: false,
      error: error.message,
      code: error.code,
    });
    return;
  }

  res.status(500).json({
    success: false,
    error: env.NODE_ENV === "production" ? "An unexpected error occurred" : error.message,
    code: "INTERNAL_ERROR",
  });
}
