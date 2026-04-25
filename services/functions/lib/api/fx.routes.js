"use strict";
/**
 * FX Routes
 * GET /fx/rate/:pair     — Get current rate for a pair
 * GET /fx/quote          — Get a transaction quote
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.fxRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const fx_service_1 = require("../services/fx/fx.service");
const auth_middleware_1 = require("../middleware/auth.middleware");
const response_1 = require("../utils/response");
const errors_1 = require("../utils/errors");
const logger_1 = require("../utils/logger");
exports.fxRouter = (0, express_1.Router)();
exports.fxRouter.use(auth_middleware_1.verifyToken);
const VALID_PAIRS = [
    "NGN/GHS",
    "GHS/NGN",
    "NGN/USDC",
    "GHS/USDC",
    "USDC/NGN",
    "USDC/GHS",
];
const quoteSchema = zod_1.z.object({
    sourceAmount: zod_1.z.coerce.number().positive(),
    pair: zod_1.z.string().refine((p) => VALID_PAIRS.includes(p), {
        message: "Invalid currency pair",
    }),
});
// GET /fx/rate/NGN%2FGHS  (URL encode the slash)
exports.fxRouter.get("/rate/:pair", async (req, res) => {
    const pair = decodeURIComponent(req.params["pair"] ?? "");
    if (!VALID_PAIRS.includes(pair)) {
        (0, response_1.sendError)(res, `Invalid pair. Valid pairs: ${VALID_PAIRS.join(", ")}`, 400, "VALIDATION_ERROR");
        return;
    }
    try {
        const rate = await fx_service_1.fxService.getRate(pair);
        (0, response_1.sendSuccess)(res, rate);
    }
    catch (error) {
        if (error instanceof errors_1.AppError) {
            (0, response_1.sendError)(res, error.message, error.statusCode, error.code);
            return;
        }
        logger_1.logger.error("Get FX rate error", { error });
        (0, response_1.sendError)(res, "Failed to fetch FX rate", 500, "INTERNAL_ERROR");
    }
});
// GET /fx/quote?sourceAmount=10000&pair=NGN%2FGHS
exports.fxRouter.get("/quote", async (req, res) => {
    const parsed = quoteSchema.safeParse(req.query);
    if (!parsed.success) {
        (0, response_1.sendError)(res, parsed.error.errors[0]?.message ?? "Invalid input", 400, "VALIDATION_ERROR");
        return;
    }
    try {
        const quote = await fx_service_1.fxService.getQuote(parsed.data.sourceAmount, parsed.data.pair, 0.015 // 1.5% platform fee
        );
        (0, response_1.sendSuccess)(res, quote);
    }
    catch (error) {
        if (error instanceof errors_1.AppError) {
            (0, response_1.sendError)(res, error.message, error.statusCode, error.code);
            return;
        }
        logger_1.logger.error("Get FX quote error", { error });
        (0, response_1.sendError)(res, "Failed to get quote", 500, "INTERNAL_ERROR");
    }
});
//# sourceMappingURL=fx.routes.js.map