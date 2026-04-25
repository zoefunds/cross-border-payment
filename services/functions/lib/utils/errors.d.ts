/**
 * Custom Error Classes
 * Typed errors make error handling predictable across all services.
 */
export declare class AppError extends Error {
    readonly code: string;
    readonly statusCode: number;
    readonly isOperational: boolean;
    constructor(message: string, code: string, statusCode?: number);
}
export declare class NotFoundError extends AppError {
    constructor(resource: string);
}
export declare class ValidationError extends AppError {
    constructor(message: string);
}
export declare class UnauthorizedError extends AppError {
    constructor(message?: string);
}
export declare class ConflictError extends AppError {
    constructor(message: string);
}
export declare class InsufficientFundsError extends AppError {
    constructor(currency: string);
}
export declare class TransactionStateError extends AppError {
    constructor(from: string, to: string);
}
