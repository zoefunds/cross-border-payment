"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_service_1 = require("../services/auth/auth.service");
const auth_middleware_1 = require("../middleware/auth.middleware");
const response_1 = require("../utils/response");
const errors_1 = require("../utils/errors");
const logger_1 = require("../utils/logger");
exports.authRouter = (0, express_1.Router)();
const registerSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8),
    phoneNumber: zod_1.z.string().min(10),
    fullName: zod_1.z.string().min(2),
    country: zod_1.z.enum(["NG", "GH"]),
    cryptoWalletAddress: zod_1.z.string().optional(),
});
const addWalletSchema = zod_1.z.object({
    address: zod_1.z.string().min(42).max(42),
    label: zod_1.z.string().optional(),
});
const setPrimarySchema = zod_1.z.object({
    address: zod_1.z.string().min(42).max(42),
});
// POST /auth/register
exports.authRouter.post("/register", async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
        (0, response_1.sendError)(res, parsed.error.errors[0]?.message ?? "Invalid input", 400, "VALIDATION_ERROR");
        return;
    }
    try {
        const user = await auth_service_1.authService.registerUser(parsed.data);
        (0, response_1.sendSuccess)(res, {
            uid: user.id,
            email: user.email,
            country: user.country,
            primaryCryptoWallet: user.primaryCryptoWallet,
        }, 201);
    }
    catch (error) {
        if (error instanceof errors_1.AppError) {
            (0, response_1.sendError)(res, error.message, error.statusCode, error.code);
            return;
        }
        logger_1.logger.error("Registration error", { error });
        (0, response_1.sendError)(res, "Registration failed", 500, "INTERNAL_ERROR");
    }
});
// GET /auth/me
exports.authRouter.get("/me", auth_middleware_1.verifyToken, async (req, res) => {
    try {
        const user = await auth_service_1.authService.getUserById(req.user.uid);
        (0, response_1.sendSuccess)(res, user);
    }
    catch (error) {
        if (error instanceof errors_1.AppError) {
            (0, response_1.sendError)(res, error.message, error.statusCode, error.code);
            return;
        }
        logger_1.logger.error("Get profile error", { error });
        (0, response_1.sendError)(res, "Failed to fetch profile", 500, "INTERNAL_ERROR");
    }
});
// POST /auth/wallets — add crypto wallet
exports.authRouter.post("/wallets", auth_middleware_1.verifyToken, async (req, res) => {
    const parsed = addWalletSchema.safeParse(req.body);
    if (!parsed.success) {
        (0, response_1.sendError)(res, parsed.error.errors[0]?.message ?? "Invalid input", 400, "VALIDATION_ERROR");
        return;
    }
    try {
        const user = await auth_service_1.authService.addCryptoWallet(req.user.uid, parsed.data.address, parsed.data.label);
        (0, response_1.sendSuccess)(res, {
            cryptoWallets: user.cryptoWallets,
            primaryCryptoWallet: user.primaryCryptoWallet,
        });
    }
    catch (error) {
        if (error instanceof errors_1.AppError) {
            (0, response_1.sendError)(res, error.message, error.statusCode, error.code);
            return;
        }
        logger_1.logger.error("Add wallet error", { error });
        (0, response_1.sendError)(res, "Failed to add wallet", 500, "INTERNAL_ERROR");
    }
});
// PUT /auth/wallets/primary — set primary wallet
exports.authRouter.put("/wallets/primary", auth_middleware_1.verifyToken, async (req, res) => {
    const parsed = setPrimarySchema.safeParse(req.body);
    if (!parsed.success) {
        (0, response_1.sendError)(res, "Invalid wallet address", 400, "VALIDATION_ERROR");
        return;
    }
    try {
        await auth_service_1.authService.setPrimaryWallet(req.user.uid, parsed.data.address);
        (0, response_1.sendSuccess)(res, { primaryCryptoWallet: parsed.data.address });
    }
    catch (error) {
        if (error instanceof errors_1.AppError) {
            (0, response_1.sendError)(res, error.message, error.statusCode, error.code);
            return;
        }
        logger_1.logger.error("Set primary wallet error", { error });
        (0, response_1.sendError)(res, "Failed to set primary wallet", 500, "INTERNAL_ERROR");
    }
});
// DELETE /auth/wallets/:address
exports.authRouter.delete("/wallets/:address", auth_middleware_1.verifyToken, async (req, res) => {
    try {
        await auth_service_1.authService.removeCryptoWallet(req.user.uid, req.params["address"] ?? "");
        (0, response_1.sendSuccess)(res, { message: "Wallet removed" });
    }
    catch (error) {
        if (error instanceof errors_1.AppError) {
            (0, response_1.sendError)(res, error.message, error.statusCode, error.code);
            return;
        }
        logger_1.logger.error("Remove wallet error", { error });
        (0, response_1.sendError)(res, "Failed to remove wallet", 500, "INTERNAL_ERROR");
    }
});
//# sourceMappingURL=auth.routes.js.map