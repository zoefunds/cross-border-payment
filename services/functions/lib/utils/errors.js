"use strict";
/**
 * Custom Error Classes
 * Typed errors make error handling predictable across all services.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransactionStateError = exports.InsufficientFundsError = exports.ConflictError = exports.UnauthorizedError = exports.ValidationError = exports.NotFoundError = exports.AppError = void 0;
class AppError extends Error {
    constructor(message, code, statusCode = 400) {
        super(message);
        this.name = "AppError";
        this.code = code;
        this.statusCode = statusCode;
        this.isOperational = true;
        Error.captureStackTrace(this, this.constructor);
    }
}
exports.AppError = AppError;
class NotFoundError extends AppError {
    constructor(resource) {
        super(`${resource} not found`, "NOT_FOUND", 404);
        this.name = "NotFoundError";
    }
}
exports.NotFoundError = NotFoundError;
class ValidationError extends AppError {
    constructor(message) {
        super(message, "VALIDATION_ERROR", 400);
        this.name = "ValidationError";
    }
}
exports.ValidationError = ValidationError;
class UnauthorizedError extends AppError {
    constructor(message = "Unauthorized") {
        super(message, "UNAUTHORIZED", 401);
        this.name = "UnauthorizedError";
    }
}
exports.UnauthorizedError = UnauthorizedError;
class ConflictError extends AppError {
    constructor(message) {
        super(message, "CONFLICT", 409);
        this.name = "ConflictError";
    }
}
exports.ConflictError = ConflictError;
class InsufficientFundsError extends AppError {
    constructor(currency) {
        super(`Insufficient ${currency} balance`, "INSUFFICIENT_FUNDS", 422);
        this.name = "InsufficientFundsError";
    }
}
exports.InsufficientFundsError = InsufficientFundsError;
class TransactionStateError extends AppError {
    constructor(from, to) {
        super(`Invalid state transition: ${from} -> ${to}`, "INVALID_STATE_TRANSITION", 422);
        this.name = "TransactionStateError";
    }
}
exports.TransactionStateError = TransactionStateError;
//# sourceMappingURL=errors.js.map