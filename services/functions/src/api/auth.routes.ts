import { Router, Request, Response } from "express";
import { z } from "zod";
import { authService } from "../services/auth/auth.service";
import { verifyToken, AuthenticatedRequest } from "../middleware/auth.middleware";
import { sendSuccess, sendError } from "../utils/response";
import { AppError } from "../utils/errors";
import { logger } from "../utils/logger";

export const authRouter = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  phoneNumber: z.string().min(10),
  fullName: z.string().min(2),
  country: z.enum(["NG", "GH"]),
  cryptoWalletAddress: z.string().optional(),
});

const addWalletSchema = z.object({
  address: z.string().min(42).max(42),
  label: z.string().optional(),
});

const setPrimarySchema = z.object({
  address: z.string().min(42).max(42),
});

// POST /auth/register
authRouter.post("/register", async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, parsed.error.errors[0]?.message ?? "Invalid input", 400, "VALIDATION_ERROR");
    return;
  }
  try {
    const user = await authService.registerUser(parsed.data);
    sendSuccess(res, {
      uid: user.id,
      email: user.email,
      country: user.country,
      primaryCryptoWallet: user.primaryCryptoWallet,
    }, 201);
  } catch (error) {
    if (error instanceof AppError) {
      sendError(res, error.message, error.statusCode, error.code);
      return;
    }
    logger.error("Registration error", { error });
    sendError(res, "Registration failed", 500, "INTERNAL_ERROR");
  }
});

// GET /auth/me
authRouter.get("/me", verifyToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await authService.getUserById(req.user!.uid);
    sendSuccess(res, user);
  } catch (error) {
    if (error instanceof AppError) {
      sendError(res, error.message, error.statusCode, error.code);
      return;
    }
    logger.error("Get profile error", { error });
    sendError(res, "Failed to fetch profile", 500, "INTERNAL_ERROR");
  }
});

// POST /auth/wallets — add crypto wallet
authRouter.post("/wallets", verifyToken, async (req: AuthenticatedRequest, res: Response) => {
  const parsed = addWalletSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, parsed.error.errors[0]?.message ?? "Invalid input", 400, "VALIDATION_ERROR");
    return;
  }
  try {
    const user = await authService.addCryptoWallet(
      req.user!.uid,
      parsed.data.address,
      parsed.data.label
    );
    sendSuccess(res, {
      cryptoWallets: user.cryptoWallets,
      primaryCryptoWallet: user.primaryCryptoWallet,
    });
  } catch (error) {
    if (error instanceof AppError) {
      sendError(res, error.message, error.statusCode, error.code);
      return;
    }
    logger.error("Add wallet error", { error });
    sendError(res, "Failed to add wallet", 500, "INTERNAL_ERROR");
  }
});

// PUT /auth/wallets/primary — set primary wallet
authRouter.put("/wallets/primary", verifyToken, async (req: AuthenticatedRequest, res: Response) => {
  const parsed = setPrimarySchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, "Invalid wallet address", 400, "VALIDATION_ERROR");
    return;
  }
  try {
    await authService.setPrimaryWallet(req.user!.uid, parsed.data.address);
    sendSuccess(res, { primaryCryptoWallet: parsed.data.address });
  } catch (error) {
    if (error instanceof AppError) {
      sendError(res, error.message, error.statusCode, error.code);
      return;
    }
    logger.error("Set primary wallet error", { error });
    sendError(res, "Failed to set primary wallet", 500, "INTERNAL_ERROR");
  }
});

// DELETE /auth/wallets/:address
authRouter.delete("/wallets/:address", verifyToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await authService.removeCryptoWallet(req.user!.uid, req.params["address"] ?? "");
    sendSuccess(res, { message: "Wallet removed" });
  } catch (error) {
    if (error instanceof AppError) {
      sendError(res, error.message, error.statusCode, error.code);
      return;
    }
    logger.error("Remove wallet error", { error });
    sendError(res, "Failed to remove wallet", 500, "INTERNAL_ERROR");
  }
});
