import { v4 as uuidv4 } from "uuid";
import { FieldValue } from "firebase-admin/firestore";
import { db, Collections } from "../../config/firebase";
import { createContextLogger } from "../../utils/logger";
import { NotFoundError, ConflictError } from "../../utils/errors";
import {
  TransactionModel,
  TransactionStatus,
  StateTransition,
  CreateTransactionDto,
} from "../../models/transaction.model";
import { TransactionStateMachine } from "./state-machine/transaction.state-machine";

const logger = createContextLogger({ service: "TransactionRepository" });

// Firestore rejects undefined values — strip them before writing
function cleanTransition(t: Partial<StateTransition>): Record<string, unknown> {
  const obj: Record<string, unknown> = {
    from: t.from,
    to: t.to,
    timestamp: t.timestamp,
    triggeredBy: t.triggeredBy,
  };
  if (t.note !== undefined) obj["note"] = t.note;
  if (t.error !== undefined) obj["error"] = t.error;
  return obj;
}

export class TransactionRepository {
  async create(dto: CreateTransactionDto): Promise<TransactionModel> {
    const existing = await db
      .collection(Collections.TRANSACTIONS)
      .where("idempotencyKey", "==", dto.idempotencyKey)
      .limit(1)
      .get();

    if (!existing.empty) {
      const existingTx = existing.docs[0].data() as TransactionModel;
      logger.warn("Duplicate transaction detected", {
        idempotencyKey: dto.idempotencyKey,
        existingId: existingTx.id,
      });
      throw new ConflictError(
        `Transaction with idempotency key ${dto.idempotencyKey} already exists`
      );
    }

    const id = uuidv4();
    const now = FieldValue.serverTimestamp();

    const initialTransition = cleanTransition({
      from: "INITIATED" as TransactionStatus,
      to: "INITIATED" as TransactionStatus,
      timestamp: new Date() as unknown as FirebaseFirestore.Timestamp,
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

    await db.collection(Collections.TRANSACTIONS).doc(id).set(transaction);

    logger.info("Transaction created", { transactionId: id, status: dto.status });

    const snap = await db.collection(Collections.TRANSACTIONS).doc(id).get();
    return snap.data() as TransactionModel;
  }

  async findById(transactionId: string): Promise<TransactionModel> {
    const doc = await db.collection(Collections.TRANSACTIONS).doc(transactionId).get();
    if (!doc.exists) throw new NotFoundError("Transaction");
    return doc.data() as TransactionModel;
  }

  async transition(
    transactionId: string,
    to: TransactionStatus,
    triggeredBy: string,
    note?: string,
    error?: string
  ): Promise<TransactionModel> {
    const txRef = db.collection(Collections.TRANSACTIONS).doc(transactionId);
    let updated!: TransactionModel;

    await db.runTransaction(async (firestoreTxn) => {
      const snap = await firestoreTxn.get(txRef);
      if (!snap.exists) throw new NotFoundError("Transaction");

      const current = snap.data() as TransactionModel;
      TransactionStateMachine.validateTransition(current.status, to);

      const now = FieldValue.serverTimestamp();

      const newTransition = cleanTransition({
        from: current.status,
        to,
        timestamp: new Date() as unknown as FirebaseFirestore.Timestamp,
        triggeredBy,
        note,
        error,
      });

      const updates: Record<string, unknown> = {
        status: to,
        updatedAt: now,
        stateHistory: [...current.stateHistory, newTransition],
      };

      if (to === "COMPLETED") updates["completedAt"] = now;
      if (to === "FAILED") {
        updates["failedAt"] = now;
        if (error) updates["failureReason"] = error;
      }
      if (to === "REFUNDED") updates["refundedAt"] = now;

      firestoreTxn.update(txRef, updates);

      updated = {
        ...current,
        status: to,
        stateHistory: [...current.stateHistory, newTransition as unknown as StateTransition],
      };
    });

    logger.info("Transaction state transitioned", { transactionId, to, triggeredBy });
    return updated;
  }

  async findByUserId(userId: string, limit = 20): Promise<TransactionModel[]> {
    const [sent, received] = await Promise.all([
      db.collection(Collections.TRANSACTIONS)
        .where("senderId", "==", userId)
        .orderBy("createdAt", "desc")
        .limit(limit)
        .get(),
      db.collection(Collections.TRANSACTIONS)
        .where("receiverId", "==", userId)
        .orderBy("createdAt", "desc")
        .limit(limit)
        .get(),
    ]);

    const all = [
      ...sent.docs.map((d) => d.data() as TransactionModel),
      ...received.docs.map((d) => d.data() as TransactionModel),
    ];

    return all
      .sort((a, b) => {
        const aTime = (a.createdAt as unknown as { _seconds: number })._seconds ?? 0;
        const bTime = (b.createdAt as unknown as { _seconds: number })._seconds ?? 0;
        return bTime - aTime;
      })
      .slice(0, limit);
  }

  async updateBlockchainRef(
    transactionId: string,
    blockchainRef: TransactionModel["blockchain"]
  ): Promise<void> {
    await db
      .collection(Collections.TRANSACTIONS)
      .doc(transactionId)
      .update({
        blockchain: blockchainRef,
        updatedAt: FieldValue.serverTimestamp(),
      });
  }
}

  async findByTxHash(txHash: string): Promise<TransactionModel> {
    const snap = await db
      .collection(Collections.TRANSACTIONS)
      .where("blockchain.txHash", "==", txHash)
      .limit(1)
      .get();
    if (snap.empty) throw new NotFoundError("Transaction");
    return snap.docs[0].data() as TransactionModel;
  }

  async findByOnChainId(onChainId: string): Promise<TransactionModel> {
    const snap = await db
      .collection(Collections.TRANSACTIONS)
      .where("blockchain.paymentId", "==", onChainId)
      .limit(1)
      .get();
    if (snap.empty) throw new NotFoundError("Transaction");
    return snap.docs[0].data() as TransactionModel;
  }

  async findStuck(olderThanMinutes: number = 30): Promise<TransactionModel[]> {
    const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);
    const stuckStatuses = ["INITIATED", "NAIRA_DEBITED", "USDC_SENT", "CEDIS_CREDITED"];
    const results: TransactionModel[] = [];

    for (const status of stuckStatuses) {
      const snap = await db
        .collection(Collections.TRANSACTIONS)
        .where("status", "==", status)
        .where("createdAt", "<", cutoff)
        .limit(50)
        .get();
      results.push(...snap.docs.map((d) => d.data() as TransactionModel));
    }

    return results;
  }


export const transactionRepository = new TransactionRepository();
