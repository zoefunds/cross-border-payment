/**
 * Ledger Routes
 * GET /ledger/history        — Get my ledger history
 * GET /ledger/balance/:currency — Get my wallet balance
 */

import { Router, Response } from "express";
import { z } from "zod";
import { ledgerService } from "../services/ledger/ledger.service";
import { verifyToken, AuthenticatedRequest } from "../middleware/auth.middleware";
import { sendSuccess, sendError } from "../utils/response";
import { AppError } from "../utils/errors";
import { logger } from "../utils/logger";
import { Currency } from "../models/user.model";

export const ledgerRouter = Router();

// All ledger routes require authentication
ledgerRouter.use(verifyToken);

const currencySchema = z.enum(["NGN", "GHS", "USDC"]);

// GET /ledger/history
ledgerRouter.get("/history", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const limit = Math.min(Number(req.query["limit"] ?? 20), 100);
    const entries = await ledgerService.getLedgerHistory(req.user!.uid, limit);
    sendSuccess(res, entries, 200, { count: entries.length });
  } catch (error) {
    if (error instanceof AppError) {
      sendError(res, error.message, error.statusCode, error.code);
      return;
    }
    logger.error("Get ledger history error", { error });
    sendError(res, "Failed to fetch ledger history", 500, "INTERNAL_ERROR");
  }
});

// GET /ledger/balance/:currency
ledgerRouter.get(
  "/balance/:currency",
  async (req: AuthenticatedRequest, res: Response) => {
    const parsed = currencySchema.safeParse(req.params["currency"]);

    if (!parsed.success) {
      sendError(res, "Invalid currency. Use NGN, GHS or USDC", 400, "VALIDATION_ERROR");
      return;
    }

    try {
      const balance = await ledgerService.getWalletBalance(
        req.user!.uid,
        parsed.data as Currency
      );
      sendSuccess(res, { currency: parsed.data, balance });
    } catch (error) {
      if (error instanceof AppError) {
        sendError(res, error.message, error.statusCode, error.code);
        return;
      }
      logger.error("Get balance error", { error });
      sendError(res, "Failed to fetch balance", 500, "INTERNAL_ERROR");
    }
  }
);
