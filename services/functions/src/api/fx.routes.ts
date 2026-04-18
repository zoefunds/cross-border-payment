/**
 * FX Routes
 * GET /fx/rate/:pair     — Get current rate for a pair
 * GET /fx/quote          — Get a transaction quote
 */

import { Router, Response } from "express";
import { z } from "zod";
import { fxService } from "../services/fx/fx.service";
import { verifyToken, AuthenticatedRequest } from "../middleware/auth.middleware";
import { sendSuccess, sendError } from "../utils/response";
import { AppError } from "../utils/errors";
import { logger } from "../utils/logger";
import { CurrencyPair } from "../models/fx-rate.model";

export const fxRouter = Router();

fxRouter.use(verifyToken);

const VALID_PAIRS = [
  "NGN/GHS",
  "GHS/NGN",
  "NGN/USDC",
  "GHS/USDC",
  "USDC/NGN",
  "USDC/GHS",
];

const quoteSchema = z.object({
  sourceAmount: z.coerce.number().positive(),
  pair: z.string().refine((p) => VALID_PAIRS.includes(p), {
    message: "Invalid currency pair",
  }),
});

// GET /fx/rate/NGN%2FGHS  (URL encode the slash)
fxRouter.get("/rate/:pair", async (req: AuthenticatedRequest, res: Response) => {
  const pair = decodeURIComponent(req.params["pair"] ?? "");

  if (!VALID_PAIRS.includes(pair)) {
    sendError(
      res,
      `Invalid pair. Valid pairs: ${VALID_PAIRS.join(", ")}`,
      400,
      "VALIDATION_ERROR"
    );
    return;
  }

  try {
    const rate = await fxService.getRate(pair as CurrencyPair);
    sendSuccess(res, rate);
  } catch (error) {
    if (error instanceof AppError) {
      sendError(res, error.message, error.statusCode, error.code);
      return;
    }
    logger.error("Get FX rate error", { error });
    sendError(res, "Failed to fetch FX rate", 500, "INTERNAL_ERROR");
  }
});

// GET /fx/quote?sourceAmount=10000&pair=NGN%2FGHS
fxRouter.get("/quote", async (req: AuthenticatedRequest, res: Response) => {
  const parsed = quoteSchema.safeParse(req.query);

  if (!parsed.success) {
    sendError(res, parsed.error.errors[0]?.message ?? "Invalid input", 400, "VALIDATION_ERROR");
    return;
  }

  try {
    const quote = await fxService.getQuote(
      parsed.data.sourceAmount,
      parsed.data.pair as CurrencyPair,
      0.015 // 1.5% platform fee
    );
    sendSuccess(res, quote);
  } catch (error) {
    if (error instanceof AppError) {
      sendError(res, error.message, error.statusCode, error.code);
      return;
    }
    logger.error("Get FX quote error", { error });
    sendError(res, "Failed to get quote", 500, "INTERNAL_ERROR");
  }
});
