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

import axios from "axios";
import { FieldValue } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db, Collections } from "../../config/firebase";
import { createContextLogger } from "../../utils/logger";
import { AppError } from "../../utils/errors";
import { FxRateModel, CurrencyPair } from "../../models/fx-rate.model";
import { env } from "../../config/env";

const logger = createContextLogger({ service: "FxService" });

// Cache TTL: 15 minutes in milliseconds
const RATE_TTL_MS = 15 * 60 * 1000;

// Platform spread per pair (2%)
const SPREAD = 0.02;

// Fallback mock rates — used if API is down AND no cache exists
const FALLBACK_RATES: Record<string, number> = {
  "NGN/GHS": 0.034,
  "GHS/NGN": 29.4,
  "NGN/USDC": 0.00065,
  "GHS/USDC": 0.075,
  "USDC/NGN": 1538.0,
  "USDC/GHS": 13.3,
};

interface ExchangeRateApiResponse {
  base: string;
  rates: Record<string, number>;
}

export class FxService {
  /**
   * Get rate for a currency pair.
   * Uses cache-first strategy with API fallback.
   */
  async getRate(pair: CurrencyPair): Promise<FxRateModel> {
    logger.info("Fetching FX rate", { pair });

    // 1. Try cache first
    const cached = await this.getCachedRate(pair);
    if (cached) {
      logger.info("FX rate served from cache", { pair, rate: cached.rate });
      return cached;
    }

    // 2. Fetch from API
    try {
      const fresh = await this.fetchFromApi(pair);
      await this.cacheRate(fresh);
      return fresh;
    } catch (error) {
      logger.warn("FX API fetch failed, attempting stale cache fallback", {
        pair,
        error,
      });

      // 3. Try stale cache as fallback
      const stale = await this.getStaleCachedRate(pair);
      if (stale) {
        logger.warn("Serving stale FX rate", {
          pair,
          rate: stale.rate,
          fetchedAt: stale.fetchedAt,
        });
        return stale;
      }

      // 4. Last resort: hardcoded fallback
      logger.warn("Using hardcoded fallback rate", { pair });
      return this.buildFallbackRate(pair);
    }
  }

  /**
   * Get fresh cached rate (within TTL).
   */
  private async getCachedRate(pair: CurrencyPair): Promise<FxRateModel | null> {
    const now = Date.now();

    const snap = await db
      .collection(Collections.FX_RATES)
      .where("pair", "==", pair)
      .where("isActive", "==", true)
      .orderBy("fetchedAt", "desc")
      .limit(1)
      .get();

    if (snap.empty) return null;

    const rate = snap.docs[0].data() as FxRateModel;

    // Check TTL
    const fetchedAt =
      (rate.fetchedAt as unknown as { _seconds: number })._seconds * 1000;
    const age = now - fetchedAt;

    if (age > RATE_TTL_MS) return null;

    return rate;
  }

  /**
   * Get most recent cached rate regardless of TTL (stale fallback).
   */
  private async getStaleCachedRate(
    pair: CurrencyPair
  ): Promise<FxRateModel | null> {
    const snap = await db
      .collection(Collections.FX_RATES)
      .where("pair", "==", pair)
      .orderBy("fetchedAt", "desc")
      .limit(1)
      .get();

    if (snap.empty) return null;

    return snap.docs[0].data() as FxRateModel;
  }

  /**
   * Fetch live rate from external API.
   */
  private async fetchFromApi(pair: CurrencyPair): Promise<FxRateModel> {
    const [baseCurrency, quoteCurrency] = pair.split("/");

    // Use env API or fall back to free tier
    const apiUrl =
      env.FX_API_URL ??
      `https://api.exchangerate-api.com/v4/latest/${baseCurrency}`;

    logger.info("Fetching from FX API", { pair, apiUrl });

    const response = await axios.get<ExchangeRateApiResponse>(apiUrl, {
      timeout: 5000,
      headers: env.FX_API_KEY
        ? { Authorization: `Bearer ${env.FX_API_KEY}` }
        : {},
    });

    const rawRate = response.data.rates[quoteCurrency ?? ""];

    if (!rawRate) {
      throw new AppError(
        `Rate not available for ${pair} from API`,
        "FX_RATE_UNAVAILABLE"
      );
    }

    return this.buildRateModel(pair, rawRate, "exchangerate-api");
  }

  /**
   * Cache rate to Firestore.
   */
  private async cacheRate(rate: FxRateModel): Promise<void> {
    // Deactivate old rates for this pair
    const old = await db
      .collection(Collections.FX_RATES)
      .where("pair", "==", rate.pair)
      .where("isActive", "==", true)
      .get();

    const batch = db.batch();

    old.docs.forEach((doc) => {
      batch.update(doc.ref, { isActive: false });
    });

    const newRef = db.collection(Collections.FX_RATES).doc(rate.id);
    batch.set(newRef, {
      ...rate,
      fetchedAt: FieldValue.serverTimestamp(),
    });

    await batch.commit();

    logger.info("FX rate cached", { pair: rate.pair, rate: rate.rate });
  }

  /**
   * Build a rate model from raw rate + spread.
   */
  private buildRateModel(
    pair: CurrencyPair,
    rawRate: number,
    provider: string
  ): FxRateModel {
    const now = new Date();
    const expires = new Date(now.getTime() + RATE_TTL_MS);

    // Effective rate = raw rate minus platform spread
    const effectiveRate = rawRate * (1 - SPREAD);
    const inverseRate = rawRate > 0 ? 1 / rawRate : 0;

    return {
      id: uuidv4(),
      pair,
      rate: rawRate,
      inverseRate,
      spread: SPREAD,
      effectiveRate,
      provider,
      fetchedAt: now as unknown as FirebaseFirestore.Timestamp,
      expiresAt: expires as unknown as FirebaseFirestore.Timestamp,
      isActive: true,
    };
  }

  /**
   * Build hardcoded fallback rate (last resort).
   */
  private buildFallbackRate(pair: CurrencyPair): FxRateModel {
    const rate = FALLBACK_RATES[pair];

    if (!rate) {
      throw new AppError(
        `No rate available for pair ${pair}`,
        "FX_RATE_NOT_FOUND",
        503
      );
    }

    return this.buildRateModel(pair, rate, "fallback");
  }

  /**
   * Convert an amount from one currency to another.
   */
  async convert(
    amount: number,
    pair: CurrencyPair
  ): Promise<{ convertedAmount: number; rate: FxRateModel }> {
    const rate = await this.getRate(pair);
    const convertedAmount = Math.floor(amount * rate.effectiveRate);

    logger.info("Currency converted", {
      amount,
      pair,
      convertedAmount,
      effectiveRate: rate.effectiveRate,
    });

    return { convertedAmount, rate };
  }

  /**
   * Get a rate quote (for showing the user before they confirm).
   * Returns rate + estimated destination amount + fee breakdown.
   */
  async getQuote(
    sourceAmount: number,
    pair: CurrencyPair,
    feePercentage: number
  ): Promise<{
    sourceAmount: number;
    destinationAmount: number;
    rate: number;
    effectiveRate: number;
    fee: number;
    pair: CurrencyPair;
    expiresAt: FirebaseFirestore.Timestamp;
  }> {
    const fxRate = await this.getRate(pair);
    const fee = Math.ceil(sourceAmount * feePercentage);
    const amountAfterFee = sourceAmount - fee;
    const destinationAmount = Math.floor(
      amountAfterFee * fxRate.effectiveRate
    );

    return {
      sourceAmount,
      destinationAmount,
      rate: fxRate.rate,
      effectiveRate: fxRate.effectiveRate,
      fee,
      pair,
      expiresAt: fxRate.expiresAt,
    };
  }
}

export const fxService = new FxService();
