/**
 * FX Service
 *
 * Fetches and caches exchange rates.
 *
 * Rate flow:
 *   1. Check Firestore cache — if fresh (< 15 min), return it
 *   2. If stale/missing — fetch from external API
 *   3. Apply platform spread
 *   4. Store in Firestore cache
 *   5. Return rate
 *
 * Fallback:
 *   If API call fails — return last cached rate with a warning log.
 *   Never fail a transaction due to FX API being down.
 */
import { FxRateModel, CurrencyPair } from "../../models/fx-rate.model";
export declare class FxService {
    /**
     * Get rate for a currency pair.
     * Uses cache-first strategy with API fallback.
     */
    getRate(pair: CurrencyPair): Promise<FxRateModel>;
    /**
     * Get fresh cached rate (within TTL).
     */
    private getCachedRate;
    /**
     * Get most recent cached rate regardless of TTL (stale fallback).
     */
    private getStaleCachedRate;
    /**
     * Fetch live rate from external API.
     */
    private fetchFromApi;
    /**
     * Cache rate to Firestore.
     */
    private cacheRate;
    /**
     * Build a rate model from raw rate + spread.
     */
    private buildRateModel;
    /**
     * Build hardcoded fallback rate (last resort).
     */
    private buildFallbackRate;
    /**
     * Convert an amount from one currency to another.
     */
    convert(amount: number, pair: CurrencyPair): Promise<{
        convertedAmount: number;
        rate: FxRateModel;
    }>;
    /**
     * Get a rate quote (for showing the user before they confirm).
     * Returns rate + estimated destination amount + fee breakdown.
     */
    getQuote(sourceAmount: number, pair: CurrencyPair, feePercentage: number): Promise<{
        sourceAmount: number;
        destinationAmount: number;
        rate: number;
        effectiveRate: number;
        fee: number;
        pair: CurrencyPair;
        expiresAt: FirebaseFirestore.Timestamp;
    }>;
}
export declare const fxService: FxService;
