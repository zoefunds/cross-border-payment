import { ethers }          from "ethers";
import { logger }          from "../logger";
import { TransferHandler } from "../handlers/transferHandler";
import { CheckpointStore } from "../state/checkpointStore";
import { sleep }           from "../utils/retry";

// ─── Constants ────────────────────────────────────────────────────────────────

/** How often to save a checkpoint even if no events fire (every 50 blocks) */
const CHECKPOINT_INTERVAL_BLOCKS = 50;

/** How long to wait before attempting reconnect after provider error */
const RECONNECT_DELAY_MS = 5_000;

/** Max reconnect attempts before giving up */
const MAX_RECONNECT_ATTEMPTS = 10;

// ─── Escrow Listener ──────────────────────────────────────────────────────────

export class EscrowListener {
  private isRunning         = false;
  private reconnectAttempts = 0;
  private lastCheckpointBlock = 0;

  constructor(
    private readonly escrow:      ethers.Contract,
    private readonly provider:    ethers.JsonRpcProvider,
    private readonly handler:     TransferHandler,
    private readonly checkpoint:  CheckpointStore
  ) {}

  /**
   * Attach all event listeners to the escrow contract.
   * Called after historical sync completes.
   *
   * @param fromBlock  The block to start listening from
   *                   (returned by HistoricalSync.sync())
   */
  async start(fromBlock: number): Promise<void> {
    if (this.isRunning) {
      logger.warn("EscrowListener already running");
      return;
    }

    this.lastCheckpointBlock = fromBlock;
    await this.attachListeners();
    this.monitorConnection();

    this.isRunning = true;
    logger.info("✅ Real-time event listeners active", { fromBlock });
  }

  /**
   * Graceful shutdown — remove all listeners
   */
  async stop(): Promise<void> {
    logger.info("🛑 Stopping event listeners...");
    await this.escrow.removeAllListeners();
    this.isRunning = false;
    logger.info("✅ Event listeners stopped");
  }

  // ─── Private: Attach Listeners ──────────────────────────────────────────

  private async attachListeners(): Promise<void> {
    const escrowAddress = await this.escrow.getAddress();

    logger.info("👂 Attaching Escrow event listeners...", {
      address: escrowAddress,
    });

    // ── TransferInitiated ──────────────────────────────────────────────────
    this.escrow.on(
      "TransferInitiated",
      async (
        txId:      string,
        sender:    string,
        recipient: string,
        amount:    bigint,
        fee:       bigint,
        netAmount: bigint,
        timestamp: bigint,
        event:     ethers.EventLog
      ) => {
        await this.safeHandle(
          "TransferInitiated",
          txId,
          event.blockNumber,
          async () => {
            await this.handler.handleTransferInitiated(
              { txId, sender, recipient, amount, fee, netAmount, timestamp },
              event.blockNumber,
              event.transactionHash
            );
            this.maybeCheckpoint(event.blockNumber);
          }
        );
      }
    );

    // ── TransferCompleted ──────────────────────────────────────────────────
    this.escrow.on(
      "TransferCompleted",
      async (
        txId:      string,
        recipient: string,
        netAmount: bigint,
        timestamp: bigint,
        event:     ethers.EventLog
      ) => {
        await this.safeHandle(
          "TransferCompleted",
          txId,
          event.blockNumber,
          async () => {
            await this.handler.handleTransferCompleted(
              { txId, recipient, netAmount, timestamp },
              event.blockNumber,
              event.transactionHash
            );
            this.maybeCheckpoint(event.blockNumber);
          }
        );
      }
    );

    // ── TransferCancelled ──────────────────────────────────────────────────
    this.escrow.on(
      "TransferCancelled",
      async (
        txId:      string,
        sender:    string,
        amount:    bigint,
        timestamp: bigint,
        event:     ethers.EventLog
      ) => {
        await this.safeHandle(
          "TransferCancelled",
          txId,
          event.blockNumber,
          async () => {
            await this.handler.handleTransferCancelled(
              { txId, sender, amount, timestamp },
              event.blockNumber,
              event.transactionHash
            );
            this.maybeCheckpoint(event.blockNumber);
          }
        );
      }
    );
  }

  // ─── Private: Error Safety ───────────────────────────────────────────────

  /**
   * Wrap every handler in try/catch.
   * One bad event must never crash the listener.
   */
  private async safeHandle(
    eventName:   string,
    txId:        string,
    blockNumber: number,
    fn:          () => Promise<void>
  ): Promise<void> {
    try {
      await fn();
    } catch (error) {
      logger.error(`Unhandled error in ${eventName} handler`, {
        txId,
        blockNumber,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // ─── Private: Checkpoint ────────────────────────────────────────────────

  /**
   * Save checkpoint every CHECKPOINT_INTERVAL_BLOCKS blocks.
   * Avoids excessive disk writes while keeping progress recent.
   */
  private maybeCheckpoint(blockNumber: number): void {
    if (blockNumber - this.lastCheckpointBlock >= CHECKPOINT_INTERVAL_BLOCKS) {
      this.checkpoint.save(blockNumber);
      this.lastCheckpointBlock = blockNumber;
    }
  }

  // ─── Private: Connection Monitor ────────────────────────────────────────

  /**
   * Poll the provider every 30s to detect dropped connections.
   * If the provider stops responding, attempt to reconnect.
   *
   * ethers.js JsonRpcProvider doesn't expose disconnect events —
   * we detect drops by polling getBlockNumber().
   */
  private monitorConnection(): void {
    const HEALTH_CHECK_INTERVAL_MS = 30_000;

    const interval = setInterval(async () => {
      try {
        await this.provider.getBlockNumber();
        // Connection healthy — reset counter
        this.reconnectAttempts = 0;
      } catch (error) {
        logger.error("Provider health check failed — connection may be lost", {
          error:   error instanceof Error ? error.message : String(error),
          attempt: this.reconnectAttempts + 1,
        });

        clearInterval(interval);
        await this.attemptReconnect();
      }
    }, HEALTH_CHECK_INTERVAL_MS);
  }

  /**
   * Reconnect after provider failure.
   * Uses exponential backoff up to MAX_RECONNECT_ATTEMPTS.
   */
  private async attemptReconnect(): Promise<void> {
    while (this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      this.reconnectAttempts++;

      const delayMs = RECONNECT_DELAY_MS * Math.pow(2, this.reconnectAttempts - 1);

      logger.info(
        `🔄 Reconnect attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${delayMs / 1000}s...`
      );

      await sleep(delayMs);

      try {
        // Test if provider is back
        const block = await this.provider.getBlockNumber();

        logger.info("✅ Provider reconnected", { currentBlock: block });

        // Re-attach all listeners (they were lost with the connection)
        await this.escrow.removeAllListeners();
        await this.attachListeners();
        this.monitorConnection();

        this.reconnectAttempts = 0;
        return;
      } catch (error) {
        logger.error(`Reconnect attempt ${this.reconnectAttempts} failed`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // All reconnect attempts exhausted — exit so process manager restarts us
    logger.error(
      `💥 Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) exceeded. Exiting.`
    );
    process.exit(1);
  }
}