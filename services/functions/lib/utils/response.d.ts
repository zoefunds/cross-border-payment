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
export declare function sendSuccess<T>(res: Response, data: T, statusCode?: number, meta?: Record<string, unknown>): void;
export declare function sendError(res: Response, error: string, statusCode?: number, code?: string): void;
