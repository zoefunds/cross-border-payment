import * as fs   from "fs";
import * as path from "path";
import { logger } from "../logger";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Checkpoint {
  lastProcessedBlock: number;
  updatedAt:          string;
  network:            string;
}

// ─── Checkpoint Store ─────────────────────────────────────────────────────────

/**
 * Persists the last processed block number to disk.
 *
 * Why disk and not memory?
 * If the relayer crashes, memory is lost. Disk survives restarts.
 *
 * In production you'd use Redis or Firestore for this.
 * Disk is correct for our current architecture.
 */
export class CheckpointStore {
  private readonly filePath: string;
  private readonly network:  string;

  constructor(network: string) {
    this.network  = network;
    this.filePath = path.resolve(
      __dirname,
      `../../../.checkpoint-${network}.json`
    );
  }

  /**
   * Save the last successfully processed block number
   */
  save(blockNumber: number): void {
    const checkpoint: Checkpoint = {
      lastProcessedBlock: blockNumber,
      updatedAt:          new Date().toISOString(),
      network:            this.network,
    };

    try {
      fs.writeFileSync(this.filePath, JSON.stringify(checkpoint, null, 2));
      logger.debug("💾 Checkpoint saved", { blockNumber });
    } catch (error) {
      // Log but never throw — checkpoint failure must not crash the relayer
      logger.error("Failed to save checkpoint", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Load last processed block.
   * Returns null if no checkpoint exists (first run).
   */
  load(): number | null {
    try {
      if (!fs.existsSync(this.filePath)) {
        logger.info("📭 No checkpoint found — this is a fresh start");
        return null;
      }

      const raw        = fs.readFileSync(this.filePath, "utf-8");
      const checkpoint = JSON.parse(raw) as Checkpoint;

      logger.info("📬 Checkpoint loaded", {
        lastProcessedBlock: checkpoint.lastProcessedBlock,
        updatedAt:          checkpoint.updatedAt,
      });

      return checkpoint.lastProcessedBlock;
    } catch (error) {
      logger.error("Failed to load checkpoint — starting from scratch", {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Delete checkpoint — useful for forced full resync
   */
  clear(): void {
    if (fs.existsSync(this.filePath)) {
      fs.unlinkSync(this.filePath);
      logger.info("🗑️  Checkpoint cleared");
    }
  }
}