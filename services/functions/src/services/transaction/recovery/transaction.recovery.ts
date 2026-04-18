/**
 * Transaction Recovery Service
 *
 * If a Firebase Function crashes mid-transaction, funds can get stuck.
 * This service runs on a schedule and recovers stuck transactions.
 *
 * Recovery logic per stuck state:
 *
 *   INITIATED (> 5 min old)
 *     → NGN was never debited → mark FAILED, no refund needed
 *
 *   NAIRA_DEBITED (> 5 min old)
 *     → NGN debited but USDC never sent → refund NGN, mark FAILED
 *
 *   USDC_SENT (> 10 min old)
 *     → USDC sent on-chain but GHS never credited
 *     → Try releasePayment() on-chain, then credit GHS
 *
 *   CEDIS_CREDITED (> 5 min old)
 *     → GHS credited but status never updated → mark COMPLETED
 */

import { db, Collections } from "../../../config/firebase";
import { createContextLogger } from "../../../utils/logger";
import { transactionRepository } from "../transaction.repository";
import { ledgerService } from "../../ledger/ledger.service";
import { getBlockchainService } from "../../../blockchain/blockchain.service";
import { TransactionModel, TransactionStatus } from "../../../models/transaction.model";

const logger = createContextLogger({ service: "TransactionRecovery" });

// How old a stuck transaction must be before recovery attempts
const STUCK_THRESHOLDS: Partial<Record<TransactionStatus, number>> = {
  INITIATED: 5 * 60 * 1000,       // 5 minutes
  NAIRA_DEBITED: 5 * 60 * 1000,   // 5 minutes
  USDC_SENT: 10 * 60 * 1000,      // 10 minutes
  CEDIS_CREDITED: 5 * 60 * 1000,  // 5 minutes
};

const RECOVERABLE_STATES: TransactionStatus[] = [
  "INITIATED",
  "NAIRA_DEBITED",
  "USDC_SENT",
  "CEDIS_CREDITED",
];

export class TransactionRecoveryService {
  /**
   * Main recovery runner — called by scheduled Firebase Function.
   * Finds all stuck transactions and attempts to recover them.
   */
  async recoverStuckTransactions(): Promise<{
    found: number;
    recovered: number;
    failed: number;
  }> {
    logger.info("Starting transaction recovery scan");

    const stuckTransactions = await this.findStuckTransactions();
    logger.info(`Found ${stuckTransactions.length} stuck transactions`);

    let recovered = 0;
    let failed = 0;

    for (const tx of stuckTransactions) {
      try {
        await this.recoverTransaction(tx);
        recovered++;
        logger.info("Transaction recovered", {
          transactionId: tx.id,
          status: tx.status,
        });
      } catch (err) {
        failed++;
        logger.error("Transaction recovery failed", {
          transactionId: tx.id,
          status: tx.status,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logger.info("Recovery scan complete", {
      found: stuckTransactions.length,
      recovered,
      failed,
    });

    return { found: stuckTransactions.length, recovered, failed };
  }

  /**
   * Find all transactions stuck in non-terminal states past their threshold.
   */
  private async findStuckTransactions(): Promise<TransactionModel[]> {
    const stuck: TransactionModel[] = [];
    const now = Date.now();

    for (const status of RECOVERABLE_STATES) {
      const threshold = STUCK_THRESHOLDS[status] ?? 5 * 60 * 1000;
      const cutoff = new Date(now - threshold);

      const snap = await db
        .collection(Collections.TRANSACTIONS)
        .where("status", "==", status)
        .where("updatedAt", "<=", cutoff)
        .limit(50)
        .get();

      snap.docs.forEach((doc) => {
        stuck.push(doc.data() as TransactionModel);
      });
    }

    return stuck;
  }

  /**
   * Recover a single stuck transaction based on its current state.
   */
  private async recoverTransaction(tx: TransactionModel): Promise<void> {
    logger.info("Recovering transaction", {
      transactionId: tx.id,
      status: tx.status,
    });

    switch (tx.status) {
      case "INITIATED":
        // NGN was never debited — safe to just fail
        await this.markFailed(tx, "Recovered: stuck in INITIATED state");
        break;

      case "NAIRA_DEBITED":
        // NGN debited but blockchain never called — refund NGN
        await this.refundAndFail(tx, "Recovered: stuck after NGN debit");
        break;

      case "USDC_SENT":
        // USDC sent on-chain — try to release and complete
        await this.recoverFromUsdcSent(tx);
        break;

      case "CEDIS_CREDITED":
        // GHS credited but never marked complete
        await transactionRepository.transition(
          tx.id, "COMPLETED", "recovery", "Recovered: completed after GHS credit"
        );
        break;

      default:
        logger.warn("Unhandled recovery state", { status: tx.status });
    }
  }

  private async markFailed(
    tx: TransactionModel,
    reason: string
  ): Promise<void> {
    await transactionRepository.transition(
      tx.id, "FAILED", "recovery", undefined, reason
    );
  }

  private async refundAndFail(
    tx: TransactionModel,
    reason: string
  ): Promise<void> {
    // Try on-chain refund first
    try {
      const blockchain = getBlockchainService();
      await blockchain.refundPayment(tx.id, reason);
    } catch (err) {
      logger.warn("On-chain refund skipped during recovery", {
        transactionId: tx.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Always do off-chain refund
    await ledgerService.creditWallet({
      userId: tx.senderId,
      currency: "NGN",
      amount: tx.sourceAmount,
      transactionId: tx.id,
      reason: "TRANSACTION_REFUND",
      description: `Recovery refund for transaction ${tx.id}`,
      createdBy: "recovery",
    });

    await transactionRepository.transition(
      tx.id, "FAILED", "recovery", undefined, reason
    );

    await transactionRepository.transition(
      tx.id, "REFUNDED", "recovery", "NGN refunded via recovery"
    );
  }

  private async recoverFromUsdcSent(tx: TransactionModel): Promise<void> {
    // Try to release the on-chain payment
    try {
      const blockchain = getBlockchainService();
      await blockchain.releasePayment(tx.id);
      logger.info("On-chain release succeeded during recovery", {
        transactionId: tx.id,
      });
    } catch (err) {
      logger.warn("On-chain release failed during recovery", {
        transactionId: tx.id,
        error: err instanceof Error ? err.message : String(err),
      });
      // If release fails, refund
      await this.refundAndFail(tx, "Recovery: on-chain release failed");
      return;
    }

    // Credit GHS to receiver
    await ledgerService.creditWallet({
      userId: tx.receiverId,
      currency: "GHS",
      amount: tx.destinationAmount,
      transactionId: tx.id,
      reason: "TRANSACTION_COMPLETION",
      description: `Recovery: GHS credit for transaction ${tx.id}`,
      createdBy: "recovery",
    });

    await transactionRepository.transition(
      tx.id, "CEDIS_CREDITED", "recovery", "Recovery: cedis credited"
    );

    await transactionRepository.transition(
      tx.id, "COMPLETED", "recovery", "Recovery: transaction completed"
    );
  }

  /**
   * Recover a single transaction by ID — for manual admin use.
   */
  async recoverById(transactionId: string): Promise<void> {
    const tx = await transactionRepository.findById(transactionId);

    if (!RECOVERABLE_STATES.includes(tx.status)) {
      throw new Error(
        `Transaction ${transactionId} is in terminal state ${tx.status} — cannot recover`
      );
    }

    await this.recoverTransaction(tx);
  }
}

export const transactionRecoveryService = new TransactionRecoveryService();
