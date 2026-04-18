import { Router, Response } from "express";
import { z } from "zod";
import { transactionOrchestrator } from "../services/transaction/orchestrator/transaction.orchestrator";
import { transactionRepository } from "../services/transaction/transaction.repository";
import { ledgerService } from "../services/ledger/ledger.service";
import { fxService } from "../services/fx/fx.service";
import { verifyToken, AuthenticatedRequest } from "../middleware/auth.middleware";
import { transactionLimiter } from "../middleware/rate-limit.middleware";
import { sendSuccess, sendError } from "../utils/response";
import { AppError } from "../utils/errors";
import { logger } from "../utils/logger";
import { CurrencyPair } from "../models/fx-rate.model";

export const transactionRouter = Router();

transactionRouter.use(verifyToken);

const initiateSchema = z.object({
  receiverId: z.string().min(1, "receiverId is required"),
  sourceAmount: z.number().positive("sourceAmount must be positive"),
  sourceCurrency: z.enum(["NGN", "GHS"]),
  idempotencyKey: z.string().min(1, "idempotencyKey is required"),
});

transactionRouter.post(
  "/initiate",
  transactionLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    const parsed = initiateSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.errors[0]?.message ?? "Invalid input", 400, "VALIDATION_ERROR");
      return;
    }
    try {
      const transaction = await transactionOrchestrator.initiate(
        req.user!.uid,
        parsed.data
      );
      sendSuccess(res, {
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
    } catch (error: unknown) {
      if (error instanceof AppError) {
        sendError(res, error.message, error.statusCode, error.code);
        return;
      }
      const msg = error instanceof Error ? error.message : String(error);
      logger.error("Initiate transaction error", { error: msg });
      sendError(res, msg || "Failed to initiate transaction", 500, "INTERNAL_ERROR");
    }
  }
);

transactionRouter.get("/", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const limit = Math.min(Number(req.query["limit"] ?? 20), 50);
    const transactions = await transactionRepository.findByUserId(req.user!.uid, limit);
    sendSuccess(res, transactions, 200, { count: transactions.length });
  } catch (error: unknown) {
    if (error instanceof AppError) {
      sendError(res, error.message, error.statusCode, error.code);
      return;
    }
    logger.error("List transactions error", { error });
    sendError(res, "Failed to fetch transactions", 500, "INTERNAL_ERROR");
  }
});

transactionRouter.get(
  "/quote/preview",
  async (req: AuthenticatedRequest, res: Response) => {
    const sourceAmount = Number(req.query["sourceAmount"]);
    const pair = decodeURIComponent(String(req.query["pair"] ?? ""));
    if (!sourceAmount || sourceAmount <= 0) {
      sendError(res, "sourceAmount must be a positive number", 400, "VALIDATION_ERROR");
      return;
    }
    if (!["NGN/GHS", "GHS/NGN"].includes(pair)) {
      sendError(res, "Invalid pair. Use: NGN/GHS, GHS/NGN", 400, "VALIDATION_ERROR");
      return;
    }
    try {
      const quote = await fxService.getQuote(sourceAmount, pair as CurrencyPair, 0.015);
      sendSuccess(res, quote);
    } catch (error: unknown) {
      if (error instanceof AppError) {
        sendError(res, error.message, error.statusCode, error.code);
        return;
      }
      logger.error("Quote preview error", { error });
      sendError(res, "Failed to get quote", 500, "INTERNAL_ERROR");
    }
  }
);

transactionRouter.get("/:id", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const transaction = await transactionRepository.findById(req.params["id"] ?? "");
    if (transaction.senderId !== req.user!.uid && transaction.receiverId !== req.user!.uid) {
      sendError(res, "Transaction not found", 404, "NOT_FOUND");
      return;
    }
    sendSuccess(res, transaction);
  } catch (error: unknown) {
    if (error instanceof AppError) {
      sendError(res, error.message, error.statusCode, error.code);
      return;
    }
    logger.error("Get transaction error", { error });
    sendError(res, "Failed to fetch transaction", 500, "INTERNAL_ERROR");
  }
});

transactionRouter.get(
  "/:id/ledger",
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const transaction = await transactionRepository.findById(req.params["id"] ?? "");
      if (transaction.senderId !== req.user!.uid && transaction.receiverId !== req.user!.uid) {
        sendError(res, "Transaction not found", 404, "NOT_FOUND");
        return;
      }
      const entries = await ledgerService.getTransactionLedgerEntries(req.params["id"] ?? "");
      sendSuccess(res, entries, 200, { count: entries.length });
    } catch (error: unknown) {
      if (error instanceof AppError) {
        sendError(res, error.message, error.statusCode, error.code);
        return;
      }
      logger.error("Get transaction ledger error", { error });
      sendError(res, "Failed to fetch transaction ledger", 500, "INTERNAL_ERROR");
    }
  }
);
