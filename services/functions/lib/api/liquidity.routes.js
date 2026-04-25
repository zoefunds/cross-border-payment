"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.liquidityRouter = void 0;
const express_1 = require("express");
const liquidity_service_1 = require("../services/liquidity/liquidity.service");
const auth_middleware_1 = require("../middleware/auth.middleware");
const response_1 = require("../utils/response");
const errors_1 = require("../utils/errors");
const logger_1 = require("../utils/logger");
exports.liquidityRouter = (0, express_1.Router)();
exports.liquidityRouter.use(auth_middleware_1.verifyToken);
// GET /liquidity/status
exports.liquidityRouter.get("/status", async (_req, res) => {
    try {
        const status = await liquidity_service_1.liquidityService.getCurrentStatus();
        (0, response_1.sendSuccess)(res, status);
    }
    catch (error) {
        if (error instanceof errors_1.AppError) {
            (0, response_1.sendError)(res, error.message, error.statusCode, error.code);
            return;
        }
        logger_1.logger.error("Get liquidity status error", { error });
        (0, response_1.sendError)(res, "Failed to fetch liquidity status", 500, "INTERNAL_ERROR");
    }
});
// GET /liquidity/history
exports.liquidityRouter.get("/history", async (req, res) => {
    try {
        const limit = Math.min(Number(req.query["limit"] ?? 24), 100);
        const history = await liquidity_service_1.liquidityService.getHistory(limit);
        (0, response_1.sendSuccess)(res, history, 200, { count: history.length });
    }
    catch (error) {
        if (error instanceof errors_1.AppError) {
            (0, response_1.sendError)(res, error.message, error.statusCode, error.code);
            return;
        }
        logger_1.logger.error("Get liquidity history error", { error });
        (0, response_1.sendError)(res, "Failed to fetch liquidity history", 500, "INTERNAL_ERROR");
    }
});
//# sourceMappingURL=liquidity.routes.js.map