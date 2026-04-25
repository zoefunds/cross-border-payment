"use strict";
/**
 * Ledger Routes
 * GET /ledger/history        — Get my ledger history
 * GET /ledger/balance/:currency — Get my wallet balance
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ledgerRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const ledger_service_1 = require("../services/ledger/ledger.service");
const auth_middleware_1 = require("../middleware/auth.middleware");
const response_1 = require("../utils/response");
const errors_1 = require("../utils/errors");
const logger_1 = require("../utils/logger");
exports.ledgerRouter = (0, express_1.Router)();
// All ledger routes require authentication
exports.ledgerRouter.use(auth_middleware_1.verifyToken);
const currencySchema = zod_1.z.enum(["NGN", "GHS", "USDC"]);
// GET /ledger/history
exports.ledgerRouter.get("/history", async (req, res) => {
    try {
        const limit = Math.min(Number(req.query["limit"] ?? 20), 100);
        const entries = await ledger_service_1.ledgerService.getLedgerHistory(req.user.uid, limit);
        (0, response_1.sendSuccess)(res, entries, 200, { count: entries.length });
    }
    catch (error) {
        if (error instanceof errors_1.AppError) {
            (0, response_1.sendError)(res, error.message, error.statusCode, error.code);
            return;
        }
        logger_1.logger.error("Get ledger history error", { error });
        (0, response_1.sendError)(res, "Failed to fetch ledger history", 500, "INTERNAL_ERROR");
    }
});
// GET /ledger/balance/:currency
exports.ledgerRouter.get("/balance/:currency", async (req, res) => {
    const parsed = currencySchema.safeParse(req.params["currency"]);
    if (!parsed.success) {
        (0, response_1.sendError)(res, "Invalid currency. Use NGN, GHS or USDC", 400, "VALIDATION_ERROR");
        return;
    }
    try {
        const balance = await ledger_service_1.ledgerService.getWalletBalance(req.user.uid, parsed.data);
        (0, response_1.sendSuccess)(res, { currency: parsed.data, balance });
    }
    catch (error) {
        if (error instanceof errors_1.AppError) {
            (0, response_1.sendError)(res, error.message, error.statusCode, error.code);
            return;
        }
        logger_1.logger.error("Get balance error", { error });
        (0, response_1.sendError)(res, "Failed to fetch balance", 500, "INTERNAL_ERROR");
    }
});
//# sourceMappingURL=ledger.routes.js.map