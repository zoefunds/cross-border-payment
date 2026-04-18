/**
 * Standardized API response helpers.
 * Every endpoint returns the same shape — makes frontend integration predictable.
 */

import { Response } from "express";

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  meta?: Record<string, unknown>;
}

export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode = 200,
  meta?: Record<string, unknown>
): void {
  const response: ApiResponse<T> = { success: true, data };
  if (meta) response.meta = meta;
  res.status(statusCode).json(response);
}

export function sendError(
  res: Response,
  error: string,
  statusCode = 400,
  code?: string
): void {
  const response: ApiResponse<null> = { success: false, error };
  if (code) response.code = code;
  res.status(statusCode).json(response);
}
