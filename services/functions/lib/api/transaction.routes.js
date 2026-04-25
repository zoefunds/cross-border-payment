"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.transactionRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const transaction_orchestrator_1 = require("../services/transaction/orchestrator/transaction.orchestrator");
const transaction_repository_1 = require("../services/transaction/transaction.repository");
const ledger_service_1 = require("../services/ledger/ledger.service");
const fx_service_1 = require("../services/fx/fx.service");
const auth_middleware_1 = require("../middleware/auth.middleware");
const rate_limit_middleware_1 = require("../middleware/rate-limit.middleware");
const response_1 = require("../utils/response");
const errors_1 = require("../utils/errors");
const logger_1 = require("../utils/logger");
exports.transactionRouter = (0, express_1.Router)();
exports.transactionRouter.use(auth_middleware_1.verifyToken);
const initiateSchema = zod_1.z.object({
    receiverId: zod_1.z.string().min(1, "receiverId is required"),
    sourceAmount: zod_1.z.number().positive("sourceAmount must be positive"),
    sourceCurrency: zod_1.z.enum(["NGN", "GHS"]),
    idempotencyKey: zod_1.z.string().min(1, "idempotencyKey is required"),
});
exports.transactionRouter.post("/initiate", rate_limit_middleware_1.transactionLimiter, async (req, res) => {
    const parsed = initiateSchema.safeParse(req.body);
    if (!parsed.success) {
        (0, response_1.sendError)(res, parsed.error.errors[0]?.message ?? "Invalid input", 400, "VALIDATION_ERROR");
        return;
    }
    try {
        const transaction = await transaction_orchestrator_1.transactionOrchestrator.initiate(req.user.uid, parsed.data);
        (0, response_1.sendSuccess)(res, {
            transactionId: transaction.id,
            status: transaction.status,
            sourceAmount: transaction.sourceAmount,
            sourceCurrency: transaction.sourceCurrency,
            destinationAmount: transaction.destinationAmount,
            destinationCurrency: transaction.destinationCurrency,
            fees: transaction.fees,
            fx: {
                rate: transaction.fx.rate,
                pair: transaction.fx.pair,
                expiresAt: transaction.fx.expiresAt,
            },
        }, 202);
    }
    catch (error) {
        if (error instanceof errors_1.AppError) {
            (0, response_1.sendError)(res, error.message, error.statusCode, error.code);
            return;
        }
        const msg = error instanceof Error ? error.message : String(error);
        logger_1.logger.error("Initiate transaction error", { error: msg });
        (0, response_1.sendError)(res, msg || "Failed to initiate transaction", 500, "INTERNAL_ERROR");
    }
});
exports.transactionRouter.get("/", async (req, res) => {
    try {
        const limit = Math.min(Number(req.query["limit"] ?? 20), 50);
        const transactions = await transaction_repository_1.transactionRepository.findByUserId(req.user.uid, limit);
        (0, response_1.sendSuccess)(res, transactions, 200, { count: transactions.length });
    }
    catch (error) {
        if (error instanceof errors_1.AppError) {
            (0, response_1.sendError)(res, error.message, error.statusCode, error.code);
            return;
        }
        logger_1.logger.error("List transactions error", { error });
        (0, response_1.sendError)(res, "Failed to fetch transactions", 500, "INTERNAL_ERROR");
    }
});
exports.transactionRouter.get("/quote/preview", async (req, res) => {
    const sourceAmount = Number(req.query["sourceAmount"]);
    const pair = decodeURIComponent(String(req.query["pair"] ?? ""));
    if (!sourceAmount || sourceAmount <= 0) {
        (0, response_1.sendError)(res, "sourceAmount must be a positive number", 400, "VALIDATION_ERROR");
        return;
    }
    if (!["NGN/GHS", "GHS/NGN"].includes(pair)) {
        (0, response_1.sendError)(res, "Invalid pair. Use: NGN/GHS, GHS/NGN", 400, "VALIDATION_ERROR");
        return;
    }
    try {
        const quote = await fx_service_1.fxService.getQuote(sourceAmount, pair, 0.015);
        (0, response_1.sendSuccess)(res, quote);
    }
    catch (error) {
        if (error instanceof errors_1.AppError) {
            (0, response_1.sendError)(res, error.message, error.statusCode, error.code);
            return;
        }
        logger_1.logger.error("Quote preview error", { error });
        (0, response_1.sendError)(res, "Failed to get quote", 500, "INTERNAL_ERROR");
    }
});
exports.transactionRouter.get("/:id", async (req, res) => {
    try {
        const transaction = await transaction_repository_1.transactionRepository.findById(req.params["id"] ?? "");
        if (transaction.senderId !== req.user.uid && transaction.receiverId !== req.user.uid) {
            (0, response_1.sendError)(res, "Transaction not found", 404, "NOT_FOUND");
            return;
        }
        (0, response_1.sendSuccess)(res, transaction);
    }
    catch (error) {
        if (error instanceof errors_1.AppError) {
            (0, response_1.sendError)(res, error.message, error.statusCode, error.code);
            return;
        }
        logger_1.logger.error("Get transaction error", { error });
        (0, response_1.sendError)(res, "Failed to fetch transaction", 500, "INTERNAL_ERROR");
    }
});
exports.transactionRouter.get("/:id/ledger", async (req, res) => {
    try {
        const transaction = await transaction_repository_1.transactionRepository.findById(req.params["id"] ?? "");
        if (transaction.senderId !== req.user.uid && transaction.receiverId !== req.user.uid) {
            (0, response_1.sendError)(res, "Transaction not found", 404, "NOT_FOUND");
            return;
        }
        const entries = await ledger_service_1.ledgerService.getTransactionLedgerEntries(req.params["id"] ?? "");
        (0, response_1.sendSuccess)(res, entries, 200, { count: entries.length });
    }
    catch (error) {
        if (error instanceof errors_1.AppError) {
            (0, response_1.sendError)(res, error.message, error.statusCode, error.code);
            return;
        }
        logger_1.logger.error("Get transaction ledger error", { error });
        (0, response_1.sendError)(res, "Failed to fetch transaction ledger", 500, "INTERNAL_ERROR");
    }
});
//# sourceMappingURL=transaction.routes.js.map