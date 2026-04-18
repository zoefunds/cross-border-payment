import { Router, Response } from "express";
import { liquidityService } from "../services/liquidity/liquidity.service";
import { verifyToken, AuthenticatedRequest } from "../middleware/auth.middleware";
import { sendSuccess, sendError } from "../utils/response";
import { AppError } from "../utils/errors";
import { logger } from "../utils/logger";

export const liquidityRouter = Router();

liquidityRouter.use(verifyToken);

// GET /liquidity/status
liquidityRouter.get("/status", async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const status = await liquidityService.getCurrentStatus();
    sendSuccess(res, status);
  } catch (error) {
    if (error instanceof AppError) {
      sendError(res, error.message, error.statusCode, error.code);
      return;
    }
    logger.error("Get liquidity status error", { error });
    sendError(res, "Failed to fetch liquidity status", 500, "INTERNAL_ERROR");
  }
});

// GET /liquidity/history
liquidityRouter.get("/history", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const limit = Math.min(Number(req.query["limit"] ?? 24), 100);
    const history = await liquidityService.getHistory(limit);
    sendSuccess(res, history, 200, { count: history.length });
  } catch (error) {
    if (error instanceof AppError) {
      sendError(res, error.message, error.statusCode, error.code);
      return;
    }
    logger.error("Get liquidity history error", { error });
    sendError(res, "Failed to fetch liquidity history", 500, "INTERNAL_ERROR");
  }
});
