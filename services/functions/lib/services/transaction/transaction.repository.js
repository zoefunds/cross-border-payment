"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.transactionRepository = exports.TransactionRepository = void 0;
const uuid_1 = require("uuid");
const firestore_1 = require("firebase-admin/firestore");
const firebase_1 = require("../../config/firebase");
const logger_1 = require("../../utils/logger");
const errors_1 = require("../../utils/errors");
const transaction_state_machine_1 = require("./state-machine/transaction.state-machine");
const logger = (0, logger_1.createContextLogger)({ service: "TransactionRepository" });
function cleanTransition(t) {
    const obj = {
        from: t.from,
        to: t.to,
        timestamp: t.timestamp,
        triggeredBy: t.triggeredBy,
    };
    if (t.note !== undefined)
        obj["note"] = t.note;
    if (t.error !== undefined)
        obj["error"] = t.error;
    return obj;
}
class TransactionRepository {
    async create(dto) {
        const existing = await firebase_1.db
            .collection(firebase_1.Collections.TRANSACTIONS)
            .where("idempotencyKey", "==", dto.idempotencyKey)
            .limit(1)
            .get();
        if (!existing.empty) {
            const existingTx = existing.docs[0].data();
            logger.warn("Duplicate transaction detected", {
                idempotencyKey: dto.idempotencyKey,
                existingId: existingTx.id,
            });
            throw new errors_1.ConflictError(`Transaction with idempotency key ${dto.idempotencyKey} already exists`);
        }
        const id = (0, uuid_1.v4)();
        const now = firestore_1.FieldValue.serverTimestamp();
        const initialTransition = cleanTransition({
            from: "INITIATED",
            to: "INITIATED",
            timestamp: new Date(),
            triggeredBy: "system",
            note: "Transaction created",
        });
        const transaction = {
            ...dto,
            id,
            stateHistory: [initialTransition],
            createdAt: now,
            updatedAt: now,
        };
        await firebase_1.db.collection(firebase_1.Collections.TRANSACTIONS).doc(id).set(transaction);
        logger.info("Transaction created", { transactionId: id, status: dto.status });
        const snap = await firebase_1.db.collection(firebase_1.Collections.TRANSACTIONS).doc(id).get();
        return snap.data();
    }
    async findById(transactionId) {
        const doc = await firebase_1.db.collection(firebase_1.Collections.TRANSACTIONS).doc(transactionId).get();
        if (!doc.exists)
            throw new errors_1.NotFoundError("Transaction");
        return doc.data();
    }
    async findByTxHash(txHash) {
        const snap = await firebase_1.db
            .collection(firebase_1.Collections.TRANSACTIONS)
            .where("blockchain.txHash", "==", txHash)
            .limit(1)
            .get();
        if (snap.empty)
            throw new errors_1.NotFoundError("Transaction");
        return snap.docs[0].data();
    }
    async findByOnChainId(onChainId) {
        const snap = await firebase_1.db
            .collection(firebase_1.Collections.TRANSACTIONS)
            .where("blockchain.paymentId", "==", onChainId)
            .limit(1)
            .get();
        if (snap.empty)
            throw new errors_1.NotFoundError("Transaction");
        return snap.docs[0].data();
    }
    async findStuck(olderThanMinutes = 30) {
        const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);
        const stuckStatuses = [
            "INITIATED",
            "NAIRA_DEBITED",
            "USDC_SENT",
            "CEDIS_CREDITED",
        ];
        const results = [];
        for (const status of stuckStatuses) {
            const snap = await firebase_1.db
                .collection(firebase_1.Collections.TRANSACTIONS)
                .where("status", "==", status)
                .where("createdAt", "<", cutoff)
                .limit(50)
                .get();
            results.push(...snap.docs.map((d) => d.data()));
        }
        return results;
    }
    async transition(transactionId, to, triggeredBy, note, error) {
        const txRef = firebase_1.db.collection(firebase_1.Collections.TRANSACTIONS).doc(transactionId);
        let updated;
        await firebase_1.db.runTransaction(async (firestoreTxn) => {
            const snap = await firestoreTxn.get(txRef);
            if (!snap.exists)
                throw new errors_1.NotFoundError("Transaction");
            const current = snap.data();
            transaction_state_machine_1.TransactionStateMachine.validateTransition(current.status, to);
            const now = firestore_1.FieldValue.serverTimestamp();
            const newTransition = cleanTransition({
                from: current.status,
                to,
                timestamp: new Date(),
                triggeredBy,
                note,
                error,
            });
            const updates = {
                status: to,
                updatedAt: now,
                stateHistory: [...current.stateHistory, newTransition],
            };
            if (to === "COMPLETED")
                updates["completedAt"] = now;
            if (to === "FAILED") {
                updates["failedAt"] = now;
                if (error)
                    updates["failureReason"] = error;
            }
            if (to === "REFUNDED")
                updates["refundedAt"] = now;
            firestoreTxn.update(txRef, updates);
            updated = {
                ...current,
                status: to,
                stateHistory: [
                    ...current.stateHistory,
                    newTransition,
                ],
            };
        });
        logger.info("Transaction state transitioned", { transactionId, to, triggeredBy });
        return updated;
    }
    async findByUserId(userId, limit = 20) {
        const [sent, received] = await Promise.all([
            firebase_1.db
                .collection(firebase_1.Collections.TRANSACTIONS)
                .where("senderId", "==", userId)
                .orderBy("createdAt", "desc")
                .limit(limit)
                .get(),
            firebase_1.db
                .collection(firebase_1.Collections.TRANSACTIONS)
                .where("receiverId", "==", userId)
                .orderBy("createdAt", "desc")
                .limit(limit)
                .get(),
        ]);
        const all = [
            ...sent.docs.map((d) => d.data()),
            ...received.docs.map((d) => d.data()),
        ];
        return all
            .sort((a, b) => {
            const aTime = a.createdAt._seconds ?? 0;
            const bTime = b.createdAt._seconds ?? 0;
            return bTime - aTime;
        })
            .slice(0, limit);
    }
    async updateBlockchainRef(transactionId, blockchainRef) {
        await firebase_1.db
            .collection(firebase_1.Collections.TRANSACTIONS)
            .doc(transactionId)
            .update({
            blockchain: blockchainRef,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
    }
}
exports.TransactionRepository = TransactionRepository;
exports.transactionRepository = new TransactionRepository();
//# sourceMappingURL=transaction.repository.js.map