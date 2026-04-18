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

import { FieldValue } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "../../config/firebase";
import { createContextLogger } from "../../utils/logger";
import { getBlockchainService } from "../../blockchain/blockchain.service";
import { env } from "../../config/env";

const logger = createContextLogger({ service: "LiquidityService" });

export type LiquidityStatus = "HEALTHY" | "WARNING" | "CRITICAL";

export interface LiquiditySnapshot {
  id: string;
  timestamp: FirebaseFirestore.Timestamp;
  treasuryUsdcBalance: number;   // Raw on-chain balance (6 decimals)
  treasuryUsdcFormatted: number; // Human readable
  lockedUsdc: number;            // Locked in contract
  availableUsdc: number;         // Available for new transactions
  status: LiquidityStatus;
  alertSent: boolean;
}

export interface LiquidityThresholds {
  critical: number;  // USDC amount (human readable)
  warning: number;
}

const DEFAULT_THRESHOLDS: LiquidityThresholds = {
  critical: 100,   // < 100 USDC = block transactions
  warning: 500,    // < 500 USDC = send alert
};

const LIQUIDITY_COLLECTION = "liquiditySnapshots";

export class LiquidityService {
  private thresholds: LiquidityThresholds;

  constructor(thresholds: LiquidityThresholds = DEFAULT_THRESHOLDS) {
    this.thresholds = thresholds;
  }

  /**
   * Take a snapshot of current liquidity state.
   * Called by scheduled function every 15 minutes.
   */
  async takeSnapshot(): Promise<LiquiditySnapshot> {
    logger.info("Taking liquidity snapshot");

    const blockchain = getBlockchainService();

    const [rawBalance, networkInfo] = await Promise.all([
      blockchain.getTreasuryBalance(),
      blockchain.getNetworkInfo(),
    ]);

    // Get locked amount from contract
    let lockedRaw = BigInt(0);
    try {
      const { ethers } = await import("ethers");
      const provider = new ethers.JsonRpcProvider(env.BASE_RPC_URL);
      const contract = new ethers.Contract(
        env.PAYMENT_CONTRACT_ADDRESS ?? "",
        ["function totalLocked() view returns (uint256)"],
        provider
      );
      lockedRaw = await contract.totalLocked() as bigint;
    } catch (err) {
      logger.warn("Could not fetch totalLocked from contract", { err });
    }

    const USDC_DECIMALS = 6;
    const balanceFormatted = Number(rawBalance) / 10 ** USDC_DECIMALS;
    const lockedFormatted = Number(lockedRaw) / 10 ** USDC_DECIMALS;
    const available = balanceFormatted - lockedFormatted;

    const status = this.calculateStatus(available);

    const snapshot: LiquiditySnapshot = {
      id: uuidv4(),
      timestamp: FieldValue.serverTimestamp() as unknown as FirebaseFirestore.Timestamp,
      treasuryUsdcBalance: Number(rawBalance),
      treasuryUsdcFormatted: balanceFormatted,
      lockedUsdc: lockedFormatted,
      availableUsdc: available,
      status,
      alertSent: false,
    };

    // Store snapshot
    await db
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
  async checkSufficientLiquidity(requiredUsdcAmount: number): Promise<void> {
    const blockchain = getBlockchainService();
    const rawBalance = await blockchain.getTreasuryBalance();

    const USDC_DECIMALS = 6;
    const balanceFormatted = Number(rawBalance) / 10 ** USDC_DECIMALS;

    if (balanceFormatted < this.thresholds.critical) {
      throw new Error(
        `Treasury USDC balance critically low: ${balanceFormatted} USDC. ` +
        `Minimum required: ${this.thresholds.critical} USDC`
      );
    }

    if (balanceFormatted < requiredUsdcAmount) {
      throw new Error(
        `Insufficient treasury USDC. Available: ${balanceFormatted}, ` +
        `Required: ${requiredUsdcAmount}`
      );
    }
  }

  /**
   * Get the latest liquidity snapshot from Firestore.
   */
  async getLatestSnapshot(): Promise<LiquiditySnapshot | null> {
    const snap = await db
      .collection(LIQUIDITY_COLLECTION)
      .orderBy("timestamp", "desc")
      .limit(1)
      .get();

    if (snap.empty) return null;
    return snap.docs[0].data() as LiquiditySnapshot;
  }

  /**
   * Get liquidity history (last N snapshots).
   */
  async getHistory(limit = 24): Promise<LiquiditySnapshot[]> {
    const snap = await db
      .collection(LIQUIDITY_COLLECTION)
      .orderBy("timestamp", "desc")
      .limit(limit)
      .get();

    return snap.docs.map((d) => d.data() as LiquiditySnapshot);
  }

  /**
   * Get current liquidity status without storing a snapshot.
   */
  async getCurrentStatus(): Promise<{
    status: LiquidityStatus;
    availableUsdc: number;
    balanceUsdc: number;
    thresholds: LiquidityThresholds;
  }> {
    const blockchain = getBlockchainService();
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

  private calculateStatus(availableUsdc: number): LiquidityStatus {
    if (availableUsdc < this.thresholds.critical) return "CRITICAL";
    if (availableUsdc < this.thresholds.warning) return "WARNING";
    return "HEALTHY";
  }

  private async handleLowLiquidity(snapshot: LiquiditySnapshot): Promise<void> {
    logger.warn("Low liquidity detected", {
      status: snapshot.status,
      available: snapshot.availableUsdc,
      thresholds: this.thresholds,
    });

    // Mark alert sent
    await db
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
    } else {
      logger.warn("LIQUIDITY WARNING", {
        availableUsdc: snapshot.availableUsdc,
        message: "Treasury balance is low. Consider replenishing soon.",
      });
    }
  }
}

export const liquidityService = new LiquidityService();
