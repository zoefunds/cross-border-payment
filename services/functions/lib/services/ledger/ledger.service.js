"use strict";
/**
 * Ledger Service
 *
 * Manages all wallet balance changes and ledger entries.
 * All writes use Firestore transactions for atomicity.
 *
 * Rule: Never update a wallet balance without a ledger entry.
 * Rule: Never create a ledger entry without updating the wallet.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ledgerService = exports.LedgerService = void 0;
const uuid_1 = require("uuid");
const firestore_1 = require("firebase-admin/firestore");
const firebase_1 = require("../../config/firebase");
const logger_1 = require("../../utils/logger");
const errors_1 = require("../../utils/errors");
const logger = (0, logger_1.createContextLogger)({ service: "LedgerService" });
class LedgerService {
    /**
     * Debit a user's wallet.
     * Checks balance, locks funds, writes ledger entry.
     * All in a single Firestore transaction.
     */
    async debitWallet(input) {
        const { userId, currency, amount, transactionId, reason, description, createdBy = "system", } = input;
        logger.info("Debiting wallet", { userId, currency, amount, transactionId });
        if (amount <= 0) {
            throw new errors_1.AppError("Debit amount must be positive", "INVALID_AMOUNT");
        }
        const userRef = firebase_1.db.collection(firebase_1.Collections.USERS).doc(userId);
        const ledgerRef = firebase_1.db.collection(firebase_1.Collections.LEDGER).doc((0, uuid_1.v4)());
        let entry;
        let newBalance;
        await firebase_1.db.runTransaction(async (txn) => {
            const userSnap = await txn.get(userRef);
            if (!userSnap.exists) {
                throw new errors_1.NotFoundError("User");
            }
            const user = userSnap.data();
            const walletIndex = user.wallets.findIndex((w) => w.currency === currency);
            if (walletIndex === -1) {
                throw new errors_1.AppError(`No ${currency} wallet found for user`, "WALLET_NOT_FOUND");
            }
            const wallet = user.wallets[walletIndex];
            const availableBalance = wallet.balance - wallet.lockedBalance;
            if (availableBalance < amount) {
                throw new errors_1.InsufficientFundsError(currency);
            }
            newBalance = wallet.balance - amount;
            // Update wallet balance in the wallets array
            const updatedWallets = [...user.wallets];
            updatedWallets[walletIndex] = {
                ...wallet,
                balance: newBalance,
            };
            // Build ledger entry
            const now = firestore_1.FieldValue.serverTimestamp();
            entry = {
                id: ledgerRef.id,
                userId,
                transactionId,
                type: "DEBIT",
                reason,
                amount,
                currency,
                balanceBefore: wallet.balance,
                balanceAfter: newBalance,
                description,
                createdAt: now,
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
    async creditWallet(input) {
        const { userId, currency, amount, transactionId, reason, description, createdBy = "system", } = input;
        logger.info("Crediting wallet", { userId, currency, amount, transactionId });
        if (amount <= 0) {
            throw new errors_1.AppError("Credit amount must be positive", "INVALID_AMOUNT");
        }
        const userRef = firebase_1.db.collection(firebase_1.Collections.USERS).doc(userId);
        const ledgerRef = firebase_1.db.collection(firebase_1.Collections.LEDGER).doc((0, uuid_1.v4)());
        let entry;
        let newBalance;
        await firebase_1.db.runTransaction(async (txn) => {
            const userSnap = await txn.get(userRef);
            if (!userSnap.exists) {
                throw new errors_1.NotFoundError("User");
            }
            const user = userSnap.data();
            const walletIndex = user.wallets.findIndex((w) => w.currency === currency);
            if (walletIndex === -1) {
                throw new errors_1.AppError(`No ${currency} wallet found for user`, "WALLET_NOT_FOUND");
            }
            const wallet = user.wallets[walletIndex];
            newBalance = wallet.balance + amount;
            const updatedWallets = [...user.wallets];
            updatedWallets[walletIndex] = {
                ...wallet,
                balance: newBalance,
            };
            const now = firestore_1.FieldValue.serverTimestamp();
            entry = {
                id: ledgerRef.id,
                userId,
                transactionId,
                type: "CREDIT",
                reason,
                amount,
                currency,
                balanceBefore: wallet.balance,
                balanceAfter: newBalance,
                description,
                createdAt: now,
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
    async getLedgerHistory(userId, limit = 20) {
        const snap = await firebase_1.db
            .collection(firebase_1.Collections.LEDGER)
            .where("userId", "==", userId)
            .orderBy("createdAt", "desc")
            .limit(limit)
            .get();
        return snap.docs.map((doc) => doc.data());
    }
    /**
     * Get ledger entries for a specific transaction.
     */
    async getTransactionLedgerEntries(transactionId) {
        const snap = await firebase_1.db
            .collection(firebase_1.Collections.LEDGER)
            .where("transactionId", "==", transactionId)
            .orderBy("createdAt", "asc")
            .get();
        return snap.docs.map((doc) => doc.data());
    }
    /**
     * Get wallet balance directly from Firestore.
     * Source of truth — always use this for balance checks.
     */
    async getWalletBalance(userId, currency) {
        const doc = await firebase_1.db.collection(firebase_1.Collections.USERS).doc(userId).get();
        if (!doc.exists) {
            throw new errors_1.NotFoundError("User");
        }
        const user = doc.data();
        const wallet = user.wallets.find((w) => w.currency === currency);
        return wallet?.balance ?? 0;
    }
}
exports.LedgerService = LedgerService;
exports.ledgerService = new LedgerService();
//# sourceMappingURL=ledger.service.js.map