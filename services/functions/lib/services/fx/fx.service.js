"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fxService = exports.FxService = void 0;
const axios_1 = __importDefault(require("axios"));
const firestore_1 = require("firebase-admin/firestore");
const uuid_1 = require("uuid");
const firebase_1 = require("../../config/firebase");
const logger_1 = require("../../utils/logger");
const errors_1 = require("../../utils/errors");
const env_1 = require("../../config/env");
const logger = (0, logger_1.createContextLogger)({ service: "FxService" });
// Cache TTL: 15 minutes in milliseconds
const RATE_TTL_MS = 15 * 60 * 1000;
// Platform spread per pair (2%)
const SPREAD = 0.02;
// Fallback mock rates — used if API is down AND no cache exists
const FALLBACK_RATES = {
    "NGN/GHS": 0.034,
    "GHS/NGN": 29.4,
    "NGN/USDC": 0.00065,
    "GHS/USDC": 0.075,
    "USDC/NGN": 1538.0,
    "USDC/GHS": 13.3,
};
class FxService {
    /**
     * Get rate for a currency pair.
     * Uses cache-first strategy with API fallback.
     */
    async getRate(pair) {
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
        }
        catch (error) {
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
    async getCachedRate(pair) {
        const now = Date.now();
        const snap = await firebase_1.db
            .collection(firebase_1.Collections.FX_RATES)
            .where("pair", "==", pair)
            .where("isActive", "==", true)
            .orderBy("fetchedAt", "desc")
            .limit(1)
            .get();
        if (snap.empty)
            return null;
        const rate = snap.docs[0].data();
        // Check TTL
        const fetchedAt = rate.fetchedAt._seconds * 1000;
        const age = now - fetchedAt;
        if (age > RATE_TTL_MS)
            return null;
        return rate;
    }
    /**
     * Get most recent cached rate regardless of TTL (stale fallback).
     */
    async getStaleCachedRate(pair) {
        const snap = await firebase_1.db
            .collection(firebase_1.Collections.FX_RATES)
            .where("pair", "==", pair)
            .orderBy("fetchedAt", "desc")
            .limit(1)
            .get();
        if (snap.empty)
            return null;
        return snap.docs[0].data();
    }
    /**
     * Fetch live rate from external API.
     */
    async fetchFromApi(pair) {
        const [baseCurrency, quoteCurrency] = pair.split("/");
        // Use env API or fall back to free tier
        const apiUrl = env_1.env.FX_API_URL ??
            `https://api.exchangerate-api.com/v4/latest/${baseCurrency}`;
        logger.info("Fetching from FX API", { pair, apiUrl });
        const response = await axios_1.default.get(apiUrl, {
            timeout: 5000,
            headers: env_1.env.FX_API_KEY
                ? { Authorization: `Bearer ${env_1.env.FX_API_KEY}` }
                : {},
        });
        const rawRate = response.data.rates[quoteCurrency ?? ""];
        if (!rawRate) {
            throw new errors_1.AppError(`Rate not available for ${pair} from API`, "FX_RATE_UNAVAILABLE");
        }
        return this.buildRateModel(pair, rawRate, "exchangerate-api");
    }
    /**
     * Cache rate to Firestore.
     */
    async cacheRate(rate) {
        // Deactivate old rates for this pair
        const old = await firebase_1.db
            .collection(firebase_1.Collections.FX_RATES)
            .where("pair", "==", rate.pair)
            .where("isActive", "==", true)
            .get();
        const batch = firebase_1.db.batch();
        old.docs.forEach((doc) => {
            batch.update(doc.ref, { isActive: false });
        });
        const newRef = firebase_1.db.collection(firebase_1.Collections.FX_RATES).doc(rate.id);
        batch.set(newRef, {
            ...rate,
            fetchedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        await batch.commit();
        logger.info("FX rate cached", { pair: rate.pair, rate: rate.rate });
    }
    /**
     * Build a rate model from raw rate + spread.
     */
    buildRateModel(pair, rawRate, provider) {
        const now = new Date();
        const expires = new Date(now.getTime() + RATE_TTL_MS);
        // Effective rate = raw rate minus platform spread
        const effectiveRate = rawRate * (1 - SPREAD);
        const inverseRate = rawRate > 0 ? 1 / rawRate : 0;
        return {
            id: (0, uuid_1.v4)(),
            pair,
            rate: rawRate,
            inverseRate,
            spread: SPREAD,
            effectiveRate,
            provider,
            fetchedAt: now,
            expiresAt: expires,
            isActive: true,
        };
    }
    /**
     * Build hardcoded fallback rate (last resort).
     */
    buildFallbackRate(pair) {
        const rate = FALLBACK_RATES[pair];
        if (!rate) {
            throw new errors_1.AppError(`No rate available for pair ${pair}`, "FX_RATE_NOT_FOUND", 503);
        }
        return this.buildRateModel(pair, rate, "fallback");
    }
    /**
     * Convert an amount from one currency to another.
     */
    async convert(amount, pair) {
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
    async getQuote(sourceAmount, pair, feePercentage) {
        const fxRate = await this.getRate(pair);
        const fee = Math.ceil(sourceAmount * feePercentage);
        const amountAfterFee = sourceAmount - fee;
        const destinationAmount = Math.floor(amountAfterFee * fxRate.effectiveRate);
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
exports.FxService = FxService;
exports.fxService = new FxService();
//# sourceMappingURL=fx.service.js.map