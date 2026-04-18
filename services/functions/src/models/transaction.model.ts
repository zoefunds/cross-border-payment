import type { Timestamp } from "firebase-admin/firestore";
import { Currency } from "./user.model";

export type TransactionStatus =
  | "INITIATED"
  | "NAIRA_DEBITED"
  | "USDC_SENT"
  | "CEDIS_CREDITED"
  | "COMPLETED"
  | "FAILED"
  | "REFUNDED";

export type TransactionType = "NGN_TO_GHS" | "GHS_TO_NGN";

export interface FxSnapshot {
  pair: string;
  rate: number;
  usdcRate: number;
  provider: string;
  lockedAt: Timestamp;
  expiresAt: Timestamp;
}

export interface BlockchainRef {
  txHash?: string;
  blockNumber?: number;
  contractAddress?: string;
  usdcAmount: number;
  confirmedAt?: Timestamp;
  gasUsed?: string;
}

export interface StateTransition {
  from: TransactionStatus;
  to: TransactionStatus;
  timestamp: Timestamp;
  triggeredBy: string;
  note?: string;
  error?: string;
}

export interface TransactionFees {
  platformFeeNgn: number;
  networkFeeUsdc: number;
  totalFeeNgn: number;
  feePercentage: number;
}

export interface TransactionModel {
  id: string;
  type: TransactionType;
  status: TransactionStatus;
  senderId: string;
  senderName: string;
  senderCountry: "NG" | "GH";
  receiverId: string;
  receiverName: string;
  receiverCountry: "NG" | "GH";
  sourceAmount: number;
  sourceCurrency: Currency;
  destinationAmount: number;
  destinationCurrency: Currency;
  fees: TransactionFees;
  fx: FxSnapshot;
  blockchain?: BlockchainRef;
  stateHistory: StateTransition[];
  failureReason?: string;
  failedAt?: Timestamp;
  refundedAt?: Timestamp;
  refundTxId?: string;
  idempotencyKey: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  completedAt?: Timestamp;
  metadata?: Record<string, unknown>;
}

export interface CreateTransactionDto {
  type: TransactionType;
  status: TransactionStatus;
  senderId: string;
  senderName: string;
  senderCountry: "NG" | "GH";
  receiverId: string;
  receiverName: string;
  receiverCountry: "NG" | "GH";
  sourceAmount: number;
  sourceCurrency: Currency;
  destinationAmount: number;
  destinationCurrency: Currency;
  fees: TransactionFees;
  fx: FxSnapshot;
  idempotencyKey: string;
}

export interface InitiateTransactionRequest {
  receiverId: string;
  sourceAmount: number;
  sourceCurrency: Currency;
  idempotencyKey: string;
}
