/**
 * Relayer Webhook Routes
 *
 * These endpoints are called by the relayer-service when on-chain events fire.
 * Protected by a shared secret (x-relayer-secret header).
 *
 * POST /relayer/health              — relayer ping
 * POST /relayer/transfer-initiated  — TransferInitiated event fired
 * POST /relayer/transfer-completed  — TransferCompleted event fired
 * POST /relayer/transfer-cancelled  — TransferCancelled event fired
 */

import { Router, Request, Response, NextFunction } from "express";
import { transactionRepository } from "../services/transaction/transaction.repository";
import { ledgerService } from "../services/ledger/ledger.service";
import { createContextLogger } from "../utils/logger";
import { sendSuccess, sendError } from "../utils/response";
import { AppError } from "../utils/errors";
import { env } from "../config/env";

const logger = createContextLogger({ service: "RelayerRoutes" });
export const relayerRouter = Router();

// ── Auth middleware — only the relayer may call these ─────────────────────────

function requireRelayerSecret(req: Request, res: Response, next: NextFunction): void {
  const secret = req.headers["x-relayer-secret"];

  if (!env.RELAYER_API_SECRET) {
    // In local dev without a secret configured, allow through with a warning
    logger.warn("RELAYER_API_SECRET not set — skipping auth (dev mode only)");
    next();
    return;
  }

  if (!secret || secret !== env.RELAYER_API_SECRET) {
    logger.warn("Relayer request rejected — bad secret", {
      ip: req.ip,
      path: req.path,
    });
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
//
// Fired when the relayer sees a TransferInitiated event on-chain.
// The relayer deposited USDC into escrow — now we verify and decide
// whether to complete or cancel.

relayerRouter.post(
  "/transfer-initiated",
  async (req: Request, res: Response): Promise<void> => {
    const {
      txId,
      sender,
      recipient,
      amount,
      fee,
      netAmount,
      timestamp,
      blockNumber,
      txHash,
    } = req.body as {
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

    logger.info("Relayer: TransferInitiated received", { txId, txHash, blockNumber });

    try {
      // txId from the relayer is a bytes32 hex — find our Firebase tx that
      // generated this same keccak256 hash.
      // The orchestrator stored the on-chain txHash when it called deposit().
      const transaction = await transactionRepository.findByTxHash(txHash)
        .catch(() => null);

      if (!transaction) {
        // Could be a deposit we didn't initiate (e.g. manual), log and ignore
        logger.warn("No Firebase transaction found for txHash", { txHash, txId });
        res.status(200).json({ action: "pending", message: "Transaction not tracked" });
        return;
      }

      if (transaction.status !== "USDC_SENT") {
        logger.warn("Transaction in unexpected state for transfer-initiated", {
          id: transaction.id,
          status: transaction.status,
        });
        res.status(200).json({ action: "pending", message: "Unexpected state" });
        return;
      }

      // Update blockchain confirmation data
      await transactionRepository.updateBlockchainRef(transaction.id, {
        txHash,
        blockNumber,
        contractAddress: env.PAYMENT_CONTRACT_ADDRESS,
        usdcAmount: Number(netAmount),
        gasUsed: "0",
      });

      logger.info("TransferInitiated: confirmed, instructing relayer to complete", {
        id: transaction.id,
        netAmount,
      });

      // Tell the relayer to call completeTransfer()
      res.status(200).json({ action: "complete", message: "Proceed to complete transfer" });

    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error("transfer-initiated handler error", { error: msg, txId });
      res.status(200).json({ action: "cancel", message: `Error: ${msg}` });
    }
  }
);

// ── POST /relayer/transfer-completed ─────────────────────────────────────────
//
// Fired when the relayer confirms completeTransfer() succeeded on-chain.
// Now we credit the recipient's GHS ledger — the final step.

relayerRouter.post(
  "/transfer-completed",
  async (req: Request, res: Response): Promise<void> => {
    const {
      txId,
      recipient,
      netAmount,
      timestamp,
      blockNumber,
      txHash,
    } = req.body as {
      txId:        string;
      recipient:   string;
      netAmount:   string;
      timestamp:   number;
      blockNumber: number;
      txHash:      string;
    };

    logger.info("Relayer: TransferCompleted received", { txId, txHash });

    try {
      const transaction = await transactionRepository.findByTxHash(
        // findByTxHash searches the initiating txHash — for completed events
        // the txHash is the completeTransfer() tx. Try finding by paymentId instead.
        txId
      ).catch(() => null)
        ?? await transactionRepository.findByOnChainId(txId).catch(() => null);

      if (!transaction) {
        logger.warn("No Firebase transaction for TransferCompleted", { txId });
        res.status(200).json({ message: "Not tracked" });
        return;
      }

      if (transaction.status === "COMPLETED") {
        logger.info("Transaction already completed, idempotent", { id: transaction.id });
        res.status(200).json({ message: "Already completed" });
        return;
      }

      // Credit GHS to receiver
      await ledgerService.creditWallet({
        userId:        transaction.receiverId,
        currency:      "GHS",
        amount:        transaction.destinationAmount,
        transactionId: transaction.id,
        reason:        "TRANSACTION_COMPLETION",
        description:   `GHS credit — on-chain settlement confirmed (${txHash})`,
      });

      await transactionRepository.transition(
        transaction.id,
        "CEDIS_CREDITED",
        "relayer",
        `On-chain settlement confirmed: ${txHash}`
      );

      await transactionRepository.transition(
        transaction.id,
        "COMPLETED",
        "relayer",
        "Transaction fully completed"
      );

      logger.info("Transaction COMPLETED via relayer webhook", {
        id:          transaction.id,
        receiverId:  transaction.receiverId,
        ghsAmount:   transaction.destinationAmount,
        txHash,
      });

      res.status(200).json({ message: "Transaction completed" });

    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error("transfer-completed handler error", { error: msg, txId });
      res.status(500).json({ error: msg });
    }
  }
);

// ── POST /relayer/transfer-cancelled ─────────────────────────────────────────
//
// Fired when cancelTransfer() completes on-chain.
// We refund the sender's NGN and mark the transaction REFUNDED.

relayerRouter.post(
  "/transfer-cancelled",
  async (req: Request, res: Response): Promise<void> => {
    const {
      txId,
      sender,
      amount,
      timestamp,
      blockNumber,
      txHash,
    } = req.body as {
      txId:        string;
      sender:      string;
      amount:      string;
      timestamp:   number;
      blockNumber: number;
      txHash:      string;
    };

    logger.info("Relayer: TransferCancelled received", { txId, txHash });

    try {
      const transaction = await transactionRepository.findByOnChainId(txId)
        .catch(() => null)
        ?? await transactionRepository.findByTxHash(txHash).catch(() => null);

      if (!transaction) {
        logger.warn("No Firebase transaction for TransferCancelled", { txId });
        res.status(200).json({ message: "Not tracked" });
        return;
      }

      if (transaction.status === "REFUNDED" || transaction.status === "FAILED") {
        logger.info("Transaction already in terminal state", {
          id: transaction.id,
          status: transaction.status,
        });
        res.status(200).json({ message: "Already in terminal state" });
        return;
      }

      // Mark failed
      await transactionRepository.transition(
        transaction.id,
        "FAILED",
        "relayer",
        undefined,
        `On-chain transfer cancelled: ${txHash}`
      );

      // Refund NGN to sender
      await ledgerService.creditWallet({
        userId:        transaction.senderId,
        currency:      "NGN",
        amount:        transaction.sourceAmount,
        transactionId: transaction.id,
        reason:        "TRANSACTION_REFUND",
        description:   `NGN refund — on-chain cancellation confirmed (${txHash})`,
      });

      await transactionRepository.transition(
        transaction.id,
        "REFUNDED",
        "relayer",
        `NGN refunded after on-chain cancellation`
      );

      logger.info("Transaction REFUNDED via relayer webhook", {
        id:       transaction.id,
        senderId: transaction.senderId,
        ngnAmount: transaction.sourceAmount,
      });

      res.status(200).json({ message: "Transaction refunded" });

    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error("transfer-cancelled handler error", { error: msg, txId });
      res.status(500).json({ error: msg });
    }
  }
);
