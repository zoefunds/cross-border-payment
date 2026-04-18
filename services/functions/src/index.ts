import * as functionsV1 from "firebase-functions/v1";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { logger } from "./utils/logger";
import "./config/firebase";
import { authRouter } from "./api/auth.routes";
import { ledgerRouter } from "./api/ledger.routes";
import { fxRouter } from "./api/fx.routes";
import { transactionRouter } from "./api/transaction.routes";
import { liquidityRouter } from "./api/liquidity.routes";
import { generalLimiter, authLimiter } from "./middleware/rate-limit.middleware";
import { errorHandler } from "./middleware/error.middleware";
import { sendError } from "./utils/response";
import { transactionRecoveryService } from "./services/transaction/recovery/transaction.recovery";
import { liquidityService } from "./services/liquidity/liquidity.service";

logger.info("Cross-Border Payment Functions initializing...", {
  nodeVersion: process.version,
  environment: process.env["APP_ENV"] ?? "development",
});

const app = express();

app.use(helmet());
app.use(cors({ origin: true }));
app.use(express.json({ limit: "10kb" }));
app.use(generalLimiter);

app.use("/auth", authLimiter, authRouter);
app.use("/ledger", ledgerRouter);
app.use("/fx", fxRouter);
app.use("/transactions", transactionRouter);
app.use("/liquidity", liquidityRouter);

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "cross-border-payment",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
  });
});

app.use((_req, res) => {
  sendError(res, "Route not found", 404, "NOT_FOUND");
});

app.use(errorHandler);

// ── HTTP API ────────────────────────────────────────────────
export const healthCheck = functionsV1
  .region("us-central1")
  .https.onRequest((_req, res) => {
    res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
  });

export const api = functionsV1
  .region("us-central1")
  .https.onRequest(app);

// ── Scheduled: Recovery — runs every 10 minutes ─────────────
export const recoverStuckTransactions = functionsV1
  .region("us-central1")
  .pubsub.schedule("every 10 minutes")
  .onRun(async () => {
    logger.info("Running scheduled transaction recovery");
    const result = await transactionRecoveryService.recoverStuckTransactions();
    logger.info("Recovery complete", result);
    return null;
  });

// ── Scheduled: Liquidity snapshot — runs every 15 minutes ───
export const takeLiquiditySnapshot = functionsV1
  .region("us-central1")
  .pubsub.schedule("every 15 minutes")
  .onRun(async () => {
    logger.info("Running scheduled liquidity snapshot");
    const snapshot = await liquidityService.takeSnapshot();
    logger.info("Liquidity snapshot complete", {
      status: snapshot.status,
      available: snapshot.availableUsdc,
    });
    return null;
  });

logger.info("Functions registered successfully");
