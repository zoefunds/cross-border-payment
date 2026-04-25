"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authLimiter = exports.transactionLimiter = exports.generalLimiter = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
// Firebase Functions proxies requests — we need to handle missing IP gracefully
const keyGenerator = (req) => {
    return (req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
        req.ip ||
        req.socket?.remoteAddress ||
        "unknown");
};
exports.generalLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator,
    validate: { xForwardedForHeader: false },
    message: { success: false, error: "Too many requests", code: "RATE_LIMITED" },
});
exports.transactionLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator,
    validate: { xForwardedForHeader: false },
    message: { success: false, error: "Too many transaction requests", code: "RATE_LIMITED" },
});
exports.authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator,
    validate: { xForwardedForHeader: false },
    message: { success: false, error: "Too many auth requests", code: "RATE_LIMITED" },
});
//# sourceMappingURL=rate-limit.middleware.js.map