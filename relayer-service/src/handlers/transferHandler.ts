import { ethers } from "ethers";
import { logger } from "../logger";
import { BackendService } from "../services/backendService";
import { config } from "../config";
import { withRetry } from "../utils/retry";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TransferInitiatedArgs {
  txId:       string;
  sender:     string;
  recipient:  string;
  amount:     bigint;
  fee:        bigint;
  netAmount:  bigint;
  timestamp:  bigint;
}

interface TransferCompletedArgs {
  txId:       string;
  recipient:  string;
  netAmount:  bigint;
  timestamp:  bigint;
}

interface TransferCancelledArgs {
  txId:       string;
  sender:     string;
  amount:     bigint;
  timestamp:  bigint;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export class TransferHandler {
  constructor(
    private readonly escrow:          ethers.Contract,
    private readonly backendService:  BackendService
  ) {}

  // ─── TransferInitiated ──────────────────────────────────────────────────

  /**
   * Called when Escrow emits TransferInitiated.
   *
   * Flow:
   * 1. Parse event args
   * 2. Notify backend → backend validates and returns action
   * 3. Execute action (complete or cancel) on-chain
   */
  async handleTransferInitiated(
    args:        TransferInitiatedArgs,
    blockNumber: number,
    txHash:      string
  ): Promise<void> {
    const { txId, sender, recipient, amount, fee, netAmount, timestamp } = args;

    logger.info("📥 TransferInitiated received", {
      txId,
      sender,
      recipient,
      amount:    ethers.formatUnits(amount, 6) + " mUSDC",
      fee:       ethers.formatUnits(fee, 6)    + " mUSDC",
      netAmount: ethers.formatUnits(netAmount, 6) + " mUSDC",
      blockNumber,
      txHash,
    });

    // ── Step 1: Notify backend ─────────────────────────────────────────────
    let action: string;

    try {
      const response = await this.backendService.notifyTransferInitiated({
        txId,
        sender,
        recipient,
        amount:      amount.toString(),
        fee:         fee.toString(),
        netAmount:   netAmount.toString(),
        timestamp:   Number(timestamp),
        blockNumber,
        txHash,
      });

      action = response.action;
      logger.info("🔁 Backend response received", { txId, action });
    } catch (error) {
      // Backend unreachable — default to cancel for user safety
      logger.error(
        "Backend unreachable — defaulting to cancel for safety",
        { txId, error: error instanceof Error ? error.message : String(error) }
      );
      action = "cancel";
    }

    // ── Step 2: Execute on-chain action ───────────────────────────────────
    if (action === "complete") {
      await this.executeCompleteTransfer(txId);
    } else if (action === "cancel") {
      await this.executeCancelTransfer(txId);
    } else {
      // "pending" — backend is handling async (e.g. waiting for bank confirm)
      logger.info("⏳ Transfer marked pending by backend — no on-chain action yet", {
        txId,
      });
    }
  }

  // ─── TransferCompleted ──────────────────────────────────────────────────

  /**
   * Called when Escrow emits TransferCompleted.
   * Notifies backend so it can update the transfer record.
   */
  async handleTransferCompleted(
    args:        TransferCompletedArgs,
    blockNumber: number,
    txHash:      string
  ): Promise<void> {
    const { txId, recipient, netAmount, timestamp } = args;

    logger.info("✅ TransferCompleted received", {
      txId,
      recipient,
      netAmount:  ethers.formatUnits(netAmount, 6) + " mUSDC",
      blockNumber,
      txHash,
    });

    try {
      await this.backendService.notifyTransferCompleted({
        txId,
        recipient,
        netAmount:   netAmount.toString(),
        timestamp:   Number(timestamp),
        blockNumber,
        txHash,
      });

      logger.info("📤 Backend notified of completion", { txId });
    } catch (error) {
      // Log but don't throw — the on-chain state is final
      logger.error("Failed to notify backend of completion", {
        txId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // ─── TransferCancelled ──────────────────────────────────────────────────

  /**
   * Called when Escrow emits TransferCancelled.
   */
  async handleTransferCancelled(
    args:        TransferCancelledArgs,
    blockNumber: number,
    txHash:      string
  ): Promise<void> {
    const { txId, sender, amount, timestamp } = args;

    logger.info("❌ TransferCancelled received", {
      txId,
      sender,
      amount:     ethers.formatUnits(amount, 6) + " mUSDC",
      blockNumber,
      txHash,
    });

    try {
      await this.backendService.notifyTransferCancelled({
        txId,
        sender,
        amount:      amount.toString(),
        timestamp:   Number(timestamp),
        blockNumber,
        txHash,
      });

      logger.info("📤 Backend notified of cancellation", { txId });
    } catch (error) {
      logger.error("Failed to notify backend of cancellation", {
        txId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // ─── On-chain Actions ───────────────────────────────────────────────────

  /**
   * Submit completeTransfer() transaction with retry
   */
  private async executeCompleteTransfer(txId: string): Promise<void> {
    logger.info("⛓️  Submitting completeTransfer...", { txId });

    await withRetry(
      async () => {
        const tx = await (this.escrow.completeTransfer as (
          txId: string
        ) => Promise<ethers.TransactionResponse>)(txId);

        logger.info("📡 completeTransfer tx submitted", {
          txId,
          hash: tx.hash,
        });

        const receipt = await tx.wait(config.confirmations);

        if (!receipt || receipt.status !== 1) {
          throw new Error(
            `completeTransfer reverted for txId: ${txId}`
          );
        }

        logger.info("✅ completeTransfer confirmed", {
          txId,
          hash:        receipt.hash,
          blockNumber: receipt.blockNumber,
          gasUsed:     receipt.gasUsed.toString(),
        });
      },
      {
        maxRetries:    config.maxRetries,
        delayMs:       config.retryDelayMs,
        backoffFactor: 2,
        label:         `completeTransfer:${txId.slice(0, 10)}`,
      }
    );
  }

  /**
   * Submit cancelTransfer() transaction with retry
   */
  private async executeCancelTransfer(txId: string): Promise<void> {
    logger.info("⛓️  Submitting cancelTransfer...", { txId });

    await withRetry(
      async () => {
        const tx = await (this.escrow.cancelTransfer as (
          txId: string
        ) => Promise<ethers.TransactionResponse>)(txId);

        logger.info("📡 cancelTransfer tx submitted", {
          txId,
          hash: tx.hash,
        });

        const receipt = await tx.wait(config.confirmations);

        if (!receipt || receipt.status !== 1) {
          throw new Error(
            `cancelTransfer reverted for txId: ${txId}`
          );
        }

        logger.info("✅ cancelTransfer confirmed", {
          txId,
          hash:        receipt.hash,
          blockNumber: receipt.blockNumber,
          gasUsed:     receipt.gasUsed.toString(),
        });
      },
      {
        maxRetries:    config.maxRetries,
        delayMs:       config.retryDelayMs,
        backoffFactor: 2,
        label:         `cancelTransfer:${txId.slice(0, 10)}`,
      }
    );
  }
}