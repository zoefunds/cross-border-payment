import type { Timestamp } from "firebase-admin/firestore";
import { Currency } from "./user.model";

export type LedgerEntryType = "DEBIT" | "CREDIT";

export type LedgerEntryReason =
  | "TRANSACTION_INITIATION"
  | "TRANSACTION_COMPLETION"
  | "TRANSACTION_REFUND"
  | "FEE_COLLECTION"
  | "MANUAL_ADJUSTMENT"
  | "WALLET_TOPUP"
  | "WALLET_WITHDRAWAL";

export interface LedgerEntry {
  id: string;
  userId: string;
  transactionId: string;
  type: LedgerEntryType;
  reason: LedgerEntryReason;
  amount: number;
  currency: Currency;
  balanceBefore: number;
  balanceAfter: number;
  description: string;
  createdAt: Timestamp;
  createdBy: string;
  metadata?: Record<string, unknown>;
}

export interface CreateLedgerEntryDto {
  userId: string;
  transactionId: string;
  type: LedgerEntryType;
  reason: LedgerEntryReason;
  amount: number;
  currency: Currency;
  balanceBefore: number;
  balanceAfter: number;
  description: string;
  createdBy: string;
  metadata?: Record<string, unknown>;
}
