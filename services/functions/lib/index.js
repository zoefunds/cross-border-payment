"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.takeLiquiditySnapshot = exports.recoverStuckTransactions = exports.api = exports.healthCheck = void 0;
const functionsV1 = __importStar(require("firebase-functions/v1"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const logger_1 = require("./utils/logger");
require("./config/firebase");
const auth_routes_1 = require("./api/auth.routes");
const ledger_routes_1 = require("./api/ledger.routes");
const fx_routes_1 = require("./api/fx.routes");
const transaction_routes_1 = require("./api/transaction.routes");
const liquidity_routes_1 = require("./api/liquidity.routes");
const relayer_routes_1 = require("./api/relayer.routes");
const rate_limit_middleware_1 = require("./middleware/rate-limit.middleware");
const error_middleware_1 = require("./middleware/error.middleware");
const response_1 = require("./utils/response");
const transaction_recovery_1 = require("./services/transaction/recovery/transaction.recovery");
const liquidity_service_1 = require("./services/liquidity/liquidity.service");
logger_1.logger.debug("Cross-Border Payment Functions initializing...", {
    nodeVersion: process.version,
    environment: process.env["APP_ENV"] ?? "development",
});
const app = (0, express_1.default)();
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)({ origin: true }));
app.use(express_1.default.json({ limit: "10kb" }));
app.use(rate_limit_middleware_1.generalLimiter);
app.use("/auth", rate_limit_middleware_1.authLimiter, auth_routes_1.authRouter);
app.use("/ledger", ledger_routes_1.ledgerRouter);
app.use("/fx", fx_routes_1.fxRouter);
app.use("/transactions", transaction_routes_1.transactionRouter);
app.use("/liquidity", liquidity_routes_1.liquidityRouter);
app.use("/relayer", relayer_routes_1.relayerRouter);
app.get("/health", (_req, res) => {
    res.status(200).json({
        status: "ok",
        service: "cross-border-payment",
        timestamp: new Date().toISOString(),
        version: "1.0.0",
    });
});
app.use((_req, res) => {
    (0, response_1.sendError)(res, "Route not found", 404, "NOT_FOUND");
});
app.use(error_middleware_1.errorHandler);
// ── HTTP API ────────────────────────────────────────────────
exports.healthCheck = functionsV1
    .region("us-central1")
    .https.onRequest((_req, res) => {
    res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});
exports.api = functionsV1
    .region("us-central1")
    .https.onRequest(app);
// ── Scheduled: Recovery — runs every 10 minutes ─────────────
exports.recoverStuckTransactions = functionsV1
    .region("us-central1")
    .pubsub.schedule("every 10 minutes")
    .onRun(async () => {
    logger_1.logger.info("Running scheduled transaction recovery");
    const result = await transaction_recovery_1.transactionRecoveryService.recoverStuckTransactions();
    logger_1.logger.info("Recovery complete", result);
    return null;
});
// ── Scheduled: Liquidity snapshot — runs every 15 minutes ───
exports.takeLiquiditySnapshot = functionsV1
    .region("us-central1")
    .pubsub.schedule("every 15 minutes")
    .onRun(async () => {
    logger_1.logger.info("Running scheduled liquidity snapshot");
    const snapshot = await liquidity_service_1.liquidityService.takeSnapshot();
    logger_1.logger.info("Liquidity snapshot complete", {
        status: snapshot.status,
        available: snapshot.availableUsdc,
    });
    return null;
});
logger_1.logger.info("Functions registered successfully");
//# sourceMappingURL=index.js.map