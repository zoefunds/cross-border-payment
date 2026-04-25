"use strict";
/**
 * Liquidity Service
 *
 * Monitors treasury USDC balance and NGN/GHS pool health.
 * Alerts when liquidity is low.
 * Tracks all liquidity movements.
 *
 * Thresholds:
 *   CRITICAL  < 100 USDC  → block new transactions
 *   WARNING   < 500 USDC  → alert operators
 *   HEALTHY   >= 500 USDC
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.liquidityService = exports.LiquidityService = void 0;
const firestore_1 = require("firebase-admin/firestore");
const uuid_1 = require("uuid");
const firebase_1 = require("../../config/firebase");
const logger_1 = require("../../utils/logger");
const blockchain_service_1 = require("../../blockchain/blockchain.service");
const env_1 = require("../../config/env");
const logger = (0, logger_1.createContextLogger)({ service: "LiquidityService" });
const DEFAULT_THRESHOLDS = {
    critical: 100, // < 100 USDC = block transactions
    warning: 500, // < 500 USDC = send alert
};
const LIQUIDITY_COLLECTION = "liquiditySnapshots";
class LiquidityService {
    constructor(thresholds = DEFAULT_THRESHOLDS) {
        this.thresholds = thresholds;
    }
    /**
     * Take a snapshot of current liquidity state.
     * Called by scheduled function every 15 minutes.
     */
    async takeSnapshot() {
        logger.info("Taking liquidity snapshot");
        const blockchain = (0, blockchain_service_1.getBlockchainService)();
        const [rawBalance, networkInfo] = await Promise.all([
            blockchain.getTreasuryBalance(),
            blockchain.getNetworkInfo(),
        ]);
        // Get locked amount from contract
        let lockedRaw = BigInt(0);
        try {
            const { ethers } = await Promise.resolve().then(() => __importStar(require("ethers")));
            const provider = new ethers.JsonRpcProvider(env_1.env.BASE_RPC_URL);
            const contract = new ethers.Contract(env_1.env.PAYMENT_CONTRACT_ADDRESS ?? "", ["function totalLocked() view returns (uint256)"], provider);
            lockedRaw = await contract.totalLocked();
        }
        catch (err) {
            logger.warn("Could not fetch totalLocked from contract", { err });
        }
        const USDC_DECIMALS = 6;
        const balanceFormatted = Number(rawBalance) / 10 ** USDC_DECIMALS;
        const lockedFormatted = Number(lockedRaw) / 10 ** USDC_DECIMALS;
        const available = balanceFormatted - lockedFormatted;
        const status = this.calculateStatus(available);
        const snapshot = {
            id: (0, uuid_1.v4)(),
            timestamp: firestore_1.FieldValue.serverTimestamp(),
            treasuryUsdcBalance: Number(rawBalance),
            treasuryUsdcFormatted: balanceFormatted,
            lockedUsdc: lockedFormatted,
            availableUsdc: available,
            status,
            alertSent: false,
        };
        // Store snapshot
        await firebase_1.db
            .collection(LIQUIDITY_COLLECTION)
            .doc(snapshot.id)
            .set(snapshot);
        logger.info("Liquidity snapshot taken", {
            status,
            balanceFormatted,
            available,
            blockNumber: networkInfo.blockNumber,
        });
        // Alert if needed
        if (status !== "HEALTHY") {
            await this.handleLowLiquidity(snapshot);
        }
        return snapshot;
    }
    /**
     * Check if there is enough liquidity for a transaction.
     * Called before initiating any transaction.
     */
    async checkSufficientLiquidity(requiredUsdcAmount) {
        const blockchain = (0, blockchain_service_1.getBlockchainService)();
        const rawBalance = await blockchain.getTreasuryBalance();
        const USDC_DECIMALS = 6;
        const balanceFormatted = Number(rawBalance) / 10 ** USDC_DECIMALS;
        if (balanceFormatted < this.thresholds.critical) {
            throw new Error(`Treasury USDC balance critically low: ${balanceFormatted} USDC. ` +
                `Minimum required: ${this.thresholds.critical} USDC`);
        }
        if (balanceFormatted < requiredUsdcAmount) {
            throw new Error(`Insufficient treasury USDC. Available: ${balanceFormatted}, ` +
                `Required: ${requiredUsdcAmount}`);
        }
    }
    /**
     * Get the latest liquidity snapshot from Firestore.
     */
    async getLatestSnapshot() {
        const snap = await firebase_1.db
            .collection(LIQUIDITY_COLLECTION)
            .orderBy("timestamp", "desc")
            .limit(1)
            .get();
        if (snap.empty)
            return null;
        return snap.docs[0].data();
    }
    /**
     * Get liquidity history (last N snapshots).
     */
    async getHistory(limit = 24) {
        const snap = await firebase_1.db
            .collection(LIQUIDITY_COLLECTION)
            .orderBy("timestamp", "desc")
            .limit(limit)
            .get();
        return snap.docs.map((d) => d.data());
    }
    /**
     * Get current liquidity status without storing a snapshot.
     */
    async getCurrentStatus() {
        const blockchain = (0, blockchain_service_1.getBlockchainService)();
        const rawBalance = await blockchain.getTreasuryBalance();
        const balanceFormatted = Number(rawBalance) / 10 ** 6;
        const status = this.calculateStatus(balanceFormatted);
        return {
            status,
            availableUsdc: balanceFormatted,
            balanceUsdc: balanceFormatted,
            thresholds: this.thresholds,
        };
    }
    calculateStatus(availableUsdc) {
        if (availableUsdc < this.thresholds.critical)
            return "CRITICAL";
        if (availableUsdc < this.thresholds.warning)
            return "WARNING";
        return "HEALTHY";
    }
    async handleLowLiquidity(snapshot) {
        logger.warn("Low liquidity detected", {
            status: snapshot.status,
            available: snapshot.availableUsdc,
            thresholds: this.thresholds,
        });
        // Mark alert sent
        await firebase_1.db
            .collection(LIQUIDITY_COLLECTION)
            .doc(snapshot.id)
            .update({ alertSent: true });
        // In production: send email/SMS/Slack alert here
        // For now: just log prominently
        if (snapshot.status === "CRITICAL") {
            logger.error("CRITICAL LIQUIDITY ALERT", {
                availableUsdc: snapshot.availableUsdc,
                message: "New transactions are being blocked. Replenish treasury immediately.",
            });
        }
        else {
            logger.warn("LIQUIDITY WARNING", {
                availableUsdc: snapshot.availableUsdc,
                message: "Treasury balance is low. Consider replenishing soon.",
            });
        }
    }
}
exports.LiquidityService = LiquidityService;
exports.liquidityService = new LiquidityService();
//# sourceMappingURL=liquidity.service.js.map