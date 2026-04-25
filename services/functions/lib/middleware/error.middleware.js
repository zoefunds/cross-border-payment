"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
const errors_1 = require("../utils/errors");
const logger_1 = require("../utils/logger");
const env_1 = require("../config/env");
function errorHandler(error, req, res, _next) {
    logger_1.logger.error("Unhandled error", {
        error: { name: error.name, message: error.message, stack: error.stack },
        request: { method: req.method, path: req.path, ip: req.ip },
    });
    if (error instanceof errors_1.AppError && error.isOperational) {
        res.status(error.statusCode).json({
            success: false,
            error: error.message,
            code: error.code,
        });
        return;
    }
    res.status(500).json({
        success: false,
        error: env_1.env.NODE_ENV === "production" ? "An unexpected error occurred" : error.message,
        code: "INTERNAL_ERROR",
    });
}
//# sourceMappingURL=error.middleware.js.map