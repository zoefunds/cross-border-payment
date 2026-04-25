"use strict";
/**
 * Standardized API response helpers.
 * Every endpoint returns the same shape — makes frontend integration predictable.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendSuccess = sendSuccess;
exports.sendError = sendError;
function sendSuccess(res, data, statusCode = 200, meta) {
    const response = { success: true, data };
    if (meta)
        response.meta = meta;
    res.status(statusCode).json(response);
}
function sendError(res, error, statusCode = 400, code) {
    const response = { success: false, error };
    if (code)
        response.code = code;
    res.status(statusCode).json(response);
}
//# sourceMappingURL=response.js.map