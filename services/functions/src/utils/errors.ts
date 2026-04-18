/**
 * Custom Error Classes
 * Typed errors make error handling predictable across all services.
 */

export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, code: string, statusCode = 400) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, "NOT_FOUND", 404);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR", 400);
    this.name = "ValidationError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(message, "UNAUTHORIZED", 401);
    this.name = "UnauthorizedError";
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, "CONFLICT", 409);
    this.name = "ConflictError";
  }
}

export class InsufficientFundsError extends AppError {
  constructor(currency: string) {
    super(`Insufficient ${currency} balance`, "INSUFFICIENT_FUNDS", 422);
    this.name = "InsufficientFundsError";
  }
}

export class TransactionStateError extends AppError {
  constructor(from: string, to: string) {
    super(
      `Invalid state transition: ${from} -> ${to}`,
      "INVALID_STATE_TRANSITION",
      422
    );
    this.name = "TransactionStateError";
  }
}
