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
export type LiquidityStatus = "HEALTHY" | "WARNING" | "CRITICAL";
export interface LiquiditySnapshot {
    id: string;
    timestamp: FirebaseFirestore.Timestamp;
    treasuryUsdcBalance: number;
    treasuryUsdcFormatted: number;
    lockedUsdc: number;
    availableUsdc: number;
    status: LiquidityStatus;
    alertSent: boolean;
}
export interface LiquidityThresholds {
    critical: number;
    warning: number;
}
export declare class LiquidityService {
    private thresholds;
    constructor(thresholds?: LiquidityThresholds);
    /**
     * Take a snapshot of current liquidity state.
     * Called by scheduled function every 15 minutes.
     */
    takeSnapshot(): Promise<LiquiditySnapshot>;
    /**
     * Check if there is enough liquidity for a transaction.
     * Called before initiating any transaction.
     */
    checkSufficientLiquidity(requiredUsdcAmount: number): Promise<void>;
    /**
     * Get the latest liquidity snapshot from Firestore.
     */
    getLatestSnapshot(): Promise<LiquiditySnapshot | null>;
    /**
     * Get liquidity history (last N snapshots).
     */
    getHistory(limit?: number): Promise<LiquiditySnapshot[]>;
    /**
     * Get current liquidity status without storing a snapshot.
     */
    getCurrentStatus(): Promise<{
        status: LiquidityStatus;
        availableUsdc: number;
        balanceUsdc: number;
        thresholds: LiquidityThresholds;
    }>;
    private calculateStatus;
    private handleLowLiquidity;
}
export declare const liquidityService: LiquidityService;
