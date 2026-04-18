/**
 * Ledger Service
 *
 * Manages all wallet balance changes and ledger entries.
 * All writes use Firestore transactions for atomicity.
 *
 * Rule: Never update a wallet balance without a ledger entry.
 * Rule: Never create a ledger entry without updating the wallet.
 */

import { v4 as uuidv4 } from "uuid";
import { FieldValue } from "firebase-admin/firestore";
import { db, Collections } from "../../config/firebase";
import { createContextLogger } from "../../utils/logger";
import {
  InsufficientFundsError,
  NotFoundError,
  AppError,
} from "../../utils/errors";
import {
  LedgerEntry,
  LedgerEntryType,
  LedgerEntryReason,
} from "../../models/ledger.model";
import { Currency, UserModel, UserWallet } from "../../models/user.model";

const logger = createContextLogger({ service: "LedgerService" });

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

export class LedgerService {
  /**
   * Debit a user's wallet.
   * Checks balance, locks funds, writes ledger entry.
   * All in a single Firestore transaction.
   */
  async debitWallet(input: DebitWalletInput): Promise<LedgerResult> {
    const {
      userId,
      currency,
      amount,
      transactionId,
      reason,
      description,
      createdBy = "system",
    } = input;

    logger.info("Debiting wallet", { userId, currency, amount, transactionId });

    if (amount <= 0) {
      throw new AppError("Debit amount must be positive", "INVALID_AMOUNT");
    }

    const userRef = db.collection(Collections.USERS).doc(userId);
    const ledgerRef = db.collection(Collections.LEDGER).doc(uuidv4());

    let entry!: LedgerEntry;
    let newBalance!: number;

    await db.runTransaction(async (txn) => {
      const userSnap = await txn.get(userRef);

      if (!userSnap.exists) {
        throw new NotFoundError("User");
      }

      const user = userSnap.data() as UserModel;
      const walletIndex = user.wallets.findIndex(
        (w) => w.currency === currency
      );

      if (walletIndex === -1) {
        throw new AppError(
          `No ${currency} wallet found for user`,
          "WALLET_NOT_FOUND"
        );
      }

      const wallet: UserWallet = user.wallets[walletIndex];
      const availableBalance = wallet.balance - wallet.lockedBalance;

      if (availableBalance < amount) {
        throw new InsufficientFundsError(currency);
      }

      newBalance = wallet.balance - amount;

      // Update wallet balance in the wallets array
      const updatedWallets = [...user.wallets];
      updatedWallets[walletIndex] = {
        ...wallet,
        balance: newBalance,
      };

      // Build ledger entry
      const now = FieldValue.serverTimestamp();
      entry = {
        id: ledgerRef.id,
        userId,
        transactionId,
        type: "DEBIT" as LedgerEntryType,
        reason,
        amount,
        currency,
        balanceBefore: wallet.balance,
        balanceAfter: newBalance,
        description,
        createdAt: now as unknown as FirebaseFirestore.Timestamp,
        createdBy,
      };

      // Atomic: update user wallets + write ledger entry
      txn.update(userRef, {
        wallets: updatedWallets,
        updatedAt: now,
      });

      txn.set(ledgerRef, entry);
    });

    logger.info("Wallet debited successfully", {
      userId,
      currency,
      amount,
      newBalance,
      ledgerEntryId: entry.id,
    });

    return { entry, newBalance };
  }

  /**
   * Credit a user's wallet.
   * Adds funds and writes ledger entry atomically.
   */
  async creditWallet(input: CreditWalletInput): Promise<LedgerResult> {
    const {
      userId,
      currency,
      amount,
      transactionId,
      reason,
      description,
      createdBy = "system",
    } = input;

    logger.info("Crediting wallet", { userId, currency, amount, transactionId });

    if (amount <= 0) {
      throw new AppError("Credit amount must be positive", "INVALID_AMOUNT");
    }

    const userRef = db.collection(Collections.USERS).doc(userId);
    const ledgerRef = db.collection(Collections.LEDGER).doc(uuidv4());

    let entry!: LedgerEntry;
    let newBalance!: number;

    await db.runTransaction(async (txn) => {
      const userSnap = await txn.get(userRef);

      if (!userSnap.exists) {
        throw new NotFoundError("User");
      }

      const user = userSnap.data() as UserModel;
      const walletIndex = user.wallets.findIndex(
        (w) => w.currency === currency
      );

      if (walletIndex === -1) {
        throw new AppError(
          `No ${currency} wallet found for user`,
          "WALLET_NOT_FOUND"
        );
      }

      const wallet: UserWallet = user.wallets[walletIndex];
      newBalance = wallet.balance + amount;

      const updatedWallets = [...user.wallets];
      updatedWallets[walletIndex] = {
        ...wallet,
        balance: newBalance,
      };

      const now = FieldValue.serverTimestamp();
      entry = {
        id: ledgerRef.id,
        userId,
        transactionId,
        type: "CREDIT" as LedgerEntryType,
        reason,
        amount,
        currency,
        balanceBefore: wallet.balance,
        balanceAfter: newBalance,
        description,
        createdAt: now as unknown as FirebaseFirestore.Timestamp,
        createdBy,
      };

      txn.update(userRef, {
        wallets: updatedWallets,
        updatedAt: now,
      });

      txn.set(ledgerRef, entry);
    });

    logger.info("Wallet credited successfully", {
      userId,
      currency,
      amount,
      newBalance,
      ledgerEntryId: entry.id,
    });

    return { entry, newBalance };
  }

  /**
   * Get ledger history for a user.
   */
  async getLedgerHistory(
    userId: string,
    limit = 20
  ): Promise<LedgerEntry[]> {
    const snap = await db
      .collection(Collections.LEDGER)
      .where("userId", "==", userId)
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get();

    return snap.docs.map((doc) => doc.data() as LedgerEntry);
  }

  /**
   * Get ledger entries for a specific transaction.
   */
  async getTransactionLedgerEntries(
    transactionId: string
  ): Promise<LedgerEntry[]> {
    const snap = await db
      .collection(Collections.LEDGER)
      .where("transactionId", "==", transactionId)
      .orderBy("createdAt", "asc")
      .get();

    return snap.docs.map((doc) => doc.data() as LedgerEntry);
  }

  /**
   * Get wallet balance directly from Firestore.
   * Source of truth — always use this for balance checks.
   */
  async getWalletBalance(
    userId: string,
    currency: Currency
  ): Promise<number> {
    const doc = await db.collection(Collections.USERS).doc(userId).get();

    if (!doc.exists) {
      throw new NotFoundError("User");
    }

    const user = doc.data() as UserModel;
    const wallet = user.wallets.find((w) => w.currency === currency);
    return wallet?.balance ?? 0;
  }
}

export const ledgerService = new LedgerService();
