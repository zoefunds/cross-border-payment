/**
 * Ledger Service
 *
 * Manages all wallet balance changes and ledger entries.
 * All writes use Firestore transactions for atomicity.
 *
 * Rule: Never update a wallet balance without a ledger entry.
 * Rule: Never create a ledger entry without updating the wallet.
 */
import { LedgerEntry, LedgerEntryReason } from "../../models/ledger.model";
import { Currency } from "../../models/user.model";
export interface DebitWalletInput {
    userId: string;
    currency: Currency;
    amount: number;
    transactionId: string;
    reason: LedgerEntryReason;
    description: string;
    createdBy?: string;
}
export interface CreditWalletInput {
    userId: string;
    currency: Currency;
    amount: number;
    transactionId: string;
    reason: LedgerEntryReason;
    description: string;
    createdBy?: string;
}
export interface LedgerResult {
    entry: LedgerEntry;
    newBalance: number;
}
export declare class LedgerService {
    /**
     * Debit a user's wallet.
     * Checks balance, locks funds, writes ledger entry.
     * All in a single Firestore transaction.
     */
    debitWallet(input: DebitWalletInput): Promise<LedgerResult>;
    /**
     * Credit a user's wallet.
     * Adds funds and writes ledger entry atomically.
     */
    creditWallet(input: CreditWalletInput): Promise<LedgerResult>;
    /**
     * Get ledger history for a user.
     */
    getLedgerHistory(userId: string, limit?: number): Promise<LedgerEntry[]>;
    /**
     * Get ledger entries for a specific transaction.
     */
    getTransactionLedgerEntries(transactionId: string): Promise<LedgerEntry[]>;
    /**
     * Get wallet balance directly from Firestore.
     * Source of truth — always use this for balance checks.
     */
    getWalletBalance(userId: string, currency: Currency): Promise<number>;
}
export declare const ledgerService: LedgerService;
