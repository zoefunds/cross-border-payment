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
export declare class TransactionRecoveryService {
    /**
     * Main recovery runner — called by scheduled Firebase Function.
     * Finds all stuck transactions and attempts to recover them.
     */
    recoverStuckTransactions(): Promise<{
        found: number;
        recovered: number;
        failed: number;
    }>;
    /**
     * Find all transactions stuck in non-terminal states past their threshold.
     */
    private findStuckTransactions;
    /**
     * Recover a single stuck transaction based on its current state.
     */
    private recoverTransaction;
    private markFailed;
    private refundAndFail;
    private recoverFromUsdcSent;
    /**
     * Recover a single transaction by ID — for manual admin use.
     */
    recoverById(transactionId: string): Promise<void>;
}
export declare const transactionRecoveryService: TransactionRecoveryService;
