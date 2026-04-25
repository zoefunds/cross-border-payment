import type { Timestamp } from "firebase-admin/firestore";
export type CurrencyPair = "NGN/GHS" | "GHS/NGN" | "NGN/USDC" | "GHS/USDC" | "USDC/NGN" | "USDC/GHS";
export interface FxRateModel {
    id: string;
    pair: CurrencyPair;
    rate: number;
    inverseRate: number;
    spread: number;
    effectiveRate: number;
    provider: string;
    fetchedAt: Timestamp;
    expiresAt: Timestamp;
    isActive: boolean;
    metadata?: Record<string, unknown>;
}
export interface CreateFxRateDto {
    pair: CurrencyPair;
    rate: number;
    inverseRate: number;
    spread: number;
    effectiveRate: number;
    provider: string;
    fetchedAt: Timestamp;
    expiresAt: Timestamp;
    isActive: boolean;
    metadata?: Record<string, unknown>;
}
