/**
 * Relayer Webhook Routes
 * Protected by x-relayer-secret header.
 *
 * POST /relayer/health
 * POST /relayer/transfer-initiated
 * POST /relayer/transfer-completed
 * POST /relayer/transfer-cancelled
 */

import { Router, Request, Response, NextFunction } from "express";
import { transactionRepository } from "../services/transaction/transaction.repository";
import { ledgerService } from "../services/ledger/ledger.service";
import { createContextLogger } from "../utils/logger";
import { sendSuccess, sendError } from "../utils/response";
import { env } from "../config/env";

const logger = createContextLogger({ service: "RelayerRoutes" });
export const relayerRouter = Router();

// ── Auth ──────────────────────────────────────────────────────────────────────

function requireRelayerSecret(req: Request, res: Response, next: NextFunction): void {
  const secret = req.headers["x-relayer-secret"];
  if (!env.RELAYER_API_SECRET) {
    logger.warn("RELAYER_API_SECRET not set — skipping auth (dev only)");
    next();
    return;
  }
  if (!secret || secret !== env.RELAYER_API_SECRET) {
    logger.warn("Relayer request rejected — bad secret", { ip: req.ip, path: req.path });
    sendError(res, "Unauthorized", 401, "UNAUTHORIZED");
    return;
  }
  next();
}

relayerRouter.use(requireRelayerSecret);

// ── GET /relayer/health ───────────────────────────────────────────────────────

relayerRouter.get("/health", (_req: Request, res: Response) => {
  sendSuccess(res, { status: "ok", service: "relayer-webhook" });
});

// ── POST /relayer/transfer-initiated ─────────────────────────────────────────

relayerRouter.post("/transfer-initiated", async (req: Request, res: Response): Promise<void> => {
  const { txId, blockNumber, txHash, netAmount } = req.body as {
    txId:        string;
    sender:      string;
    recipient:   string;
    amount:      string;
    fee:         string;
    netAmount:   string;
    timestamp:   number;
    blockNumber: number;
    txHash:      string;
  };

  logger.info("Relayer: TransferInitiated", { txId, txHash, blockNumber });

  try {
    const transaction = await transactionRepository.findByTxHash(txHash).catch(() => null);

    if (!transaction) {
      logger.warn("No Firebase tx for txHash", { txHash, txId });
      res.status(200).json({ action: "pending", message: "Not tracked" });
      return;
    }

    if (transaction.status !== "USDC_SENT") {
      logger.warn("Unexpected state for transfer-initiated", { id: transaction.id, status: transaction.status });
      res.status(200).json({ action: "pending", message: "Unexpected state" });
      return;
    }

    await transactionRepository.updateBlockchainRef(transaction.id, {
      paymentId:       txId,
      txHash,
      blockNumber,
      contractAddress: env.PAYMENT_CONTRACT_ADDRESS,
      usdcAmount:      Number(netAmount),
      gasUsed:         "0",
    });

    logger.info("TransferInitiated confirmed — instructing complete", { id: transaction.id });
    res.status(200).json({ action: "complete", message: "Proceed to complete transfer" });

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error("transfer-initiated error", { error: msg, txId });
    res.status(200).json({ action: "cancel", message: `Error: ${msg}` });
  }
});

// ── POST /relayer/transfer-completed ─────────────────────────────────────────

relayerRouter.post("/transfer-completed", async (req: Request, res: Response): Promise<void> => {
  const { txId, txHash } = req.body as {
    txId:        string;
    recipient:   string;
    netAmount:   string;
    timestamp:   number;
    blockNumber: number;
    txHash:      string;
  };

  logger.info("Relayer: TransferCompleted", { txId, txHash });

  try {
    const transaction =
      await transactionRepository.findByOnChainId(txId).catch(() => null) ??
      await transactionRepository.findByTxHash(txHash).catch(() => null);

    if (!transaction) {
      logger.warn("No Firebase tx for TransferCompleted", { txId });
      res.status(200).json({ message: "Not tracked" });
      return;
    }

    if (transaction.status === "COMPLETED") {
      res.status(200).json({ message: "Already completed" });
      return;
    }

    await ledgerService.creditWallet({
      userId:        transaction.receiverId,
      currency:      "GHS",
      amount:        transaction.destinationAmount,
      transactionId: transaction.id,
      reason:        "TRANSACTION_COMPLETION",
      description:   `GHS credit — on-chain confirmed (${txHash})`,
    });

    await transactionRepository.transition(transaction.id, "CEDIS_CREDITED", "relayer",
      `On-chain settlement confirmed: ${txHash}`);

    await transactionRepository.transition(transaction.id, "COMPLETED", "relayer",
      "Transaction fully completed");

    logger.info("Transaction COMPLETED via relayer", { id: transaction.id, txHash });
    res.status(200).json({ message: "Transaction completed" });

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error("transfer-completed error", { error: msg, txId });
    res.status(500).json({ error: msg });
  }
});

// ── POST /relayer/transfer-cancelled ─────────────────────────────────────────

relayerRouter.post("/transfer-cancelled", async (req: Request, res: Response): Promise<void> => {
  const { txId, txHash } = req.body as {
    txId:        string;
    sender:      string;
    amount:      string;
    timestamp:   number;
    blockNumber: number;
    txHash:      string;
  };

  logger.info("Relayer: TransferCancelled", { txId, txHash });

  try {
    const transaction =
      await transactionRepository.findByOnChainId(txId).catch(() => null) ??
      await transactionRepository.findByTxHash(txHash).catch(() => null);

    if (!transaction) {
      logger.warn("No Firebase tx for TransferCancelled", { txId });
      res.status(200).json({ message: "Not tracked" });
      return;
    }

    if (transaction.status === "REFUNDED" || transaction.status === "FAILED") {
      res.status(200).json({ message: "Already in terminal state" });
      return;
    }

    await transactionRepository.transition(transaction.id, "FAILED", "relayer",
      undefined, `On-chain transfer cancelled: ${txHash}`);

    await ledgerService.creditWallet({
      userId:        transaction.senderId,
      currency:      "NGN",
      amount:        transaction.sourceAmount,
      transactionId: transaction.id,
      reason:        "TRANSACTION_REFUND",
      description:   `NGN refund — cancellation confirmed (${txHash})`,
    });

    await transactionRepository.transition(transaction.id, "REFUNDED", "relayer",
      "NGN refunded after on-chain cancellation");

    logger.info("Transaction REFUNDED via relayer", { id: transaction.id, txHash });
    res.status(200).json({ message: "Transaction refunded" });

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error("transfer-cancelled error", { error: msg, txId });
    res.status(500).json({ error: msg });
  }
});
