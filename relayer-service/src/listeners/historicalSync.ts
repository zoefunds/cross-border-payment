import { ethers }          from "ethers";
import { logger }          from "../logger";
import { TransferHandler } from "../handlers/transferHandler";
import { CheckpointStore } from "../state/checkpointStore";

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * How many blocks to query per batch.
 *
 * RPC providers limit event query ranges.
 * Alchemy/QuickNode allow ~2000 blocks per getLogs call.
 * We use 1000 to stay safely under limits.
 */
const BLOCKS_PER_BATCH = 1000;

/**
 * How many blocks behind the escrow deployment to start on first run.
 * If no checkpoint exists, we look back this many blocks.
 * ~1 day of Base Sepolia blocks (2s block time).
 */
const DEFAULT_LOOKBACK_BLOCKS = 43_200;

// ─── Historical Sync ──────────────────────────────────────────────────────────

export class HistoricalSync {
  constructor(
    private readonly escrow:      ethers.Contract,
    private readonly provider:    ethers.JsonRpcProvider,
    private readonly handler:     TransferHandler,
    private readonly checkpoint:  CheckpointStore
  ) {}

  /**
   * Replay all missed events from the last checkpoint to the current block.
   *
   * Called once on relayer startup — before real-time listeners begin.
   *
   * @returns The current block number (used to start real-time listener from)
   */
  async sync(): Promise<number> {
    const currentBlock = await this.provider.getBlockNumber();

    // ── Determine start block ─────────────────────────────────────────────
    const savedBlock    = this.checkpoint.load();
    const fromBlock     = savedBlock !== null
      ? savedBlock + 1                            // resume from after last processed
      : Math.max(0, currentBlock - DEFAULT_LOOKBACK_BLOCKS); // first run

    logger.info("🔄 Starting historical sync...", {
      fromBlock,
      toBlock:   currentBlock,
      blocks:    currentBlock - fromBlock,
    });

    if (fromBlock > currentBlock) {
      logger.info("✅ No blocks to sync — relayer is up to date");
      return currentBlock;
    }

    // ── Process in batches ────────────────────────────────────────────────
    let processedCount = 0;
    let batchStart     = fromBlock;

    while (batchStart <= currentBlock) {
      const batchEnd = Math.min(batchStart + BLOCKS_PER_BATCH - 1, currentBlock);

      logger.debug(`📦 Syncing batch: blocks ${batchStart} → ${batchEnd}`);

      await this.processBatch(batchStart, batchEnd);

      // Save checkpoint after each successful batch
      this.checkpoint.save(batchEnd);

      processedCount += batchEnd - batchStart + 1;
      batchStart      = batchEnd + 1;
    }

    logger.info("✅ Historical sync complete", {
      blocksProcessed: processedCount,
      currentBlock,
    });

    return currentBlock;
  }

  // ─── Private ────────────────────────────────────────────────────────────

  /**
   * Fetch and process all Escrow events in a block range
   */
  private async processBatch(
    fromBlock: number,
    toBlock:   number
  ): Promise<void> {
    // Query all three event types in parallel for efficiency
    const [initiated, completed, cancelled] = await Promise.all([
      this.queryEvents("TransferInitiated", fromBlock, toBlock),
      this.queryEvents("TransferCompleted",  fromBlock, toBlock),
      this.queryEvents("TransferCancelled",  fromBlock, toBlock),
    ]);

    // Merge and sort by block number + log index for strict ordering
    const allEvents = [...initiated, ...completed, ...cancelled].sort(
      (a, b) =>
        a.blockNumber !== b.blockNumber
          ? a.blockNumber - b.blockNumber
          : a.index - b.index
    );

    if (allEvents.length > 0) {
      logger.info(`📨 Found ${allEvents.length} historical events`, {
        fromBlock,
        toBlock,
      });
    }

    // Process each event through the same handlers as real-time
    for (const event of allEvents) {
      await this.dispatchEvent(event);
    }
  }

  /**
   * Query a specific event type from the contract
   */
  private async queryEvents(
    eventName: string,
    fromBlock: number,
    toBlock:   number
  ): Promise<ethers.EventLog[]> {
    try {
      const filter = this.escrow.filters[eventName]?.();
      if (!filter) {
        logger.warn(`No filter found for event: ${eventName}`);
        return [];
      }

      const events = await this.escrow.queryFilter(filter, fromBlock, toBlock);
      return events.filter(
        (e): e is ethers.EventLog => e instanceof ethers.EventLog
      );
    } catch (error) {
      logger.error(`Failed to query ${eventName} events`, {
        fromBlock,
        toBlock,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Dispatch a historical event to the correct handler
   */
  private async dispatchEvent(event: ethers.EventLog): Promise<void> {
    const eventName  = event.fragment.name;
    const blockNumber = event.blockNumber;
    const txHash      = event.transactionHash;
    const args        = event.args;

    logger.debug(`📋 Replaying historical event: ${eventName}`, {
      blockNumber,
      txHash,
    });

    try {
      switch (eventName) {
        case "TransferInitiated":
          await this.handler.handleTransferInitiated(
            {
              txId:      args[0] as string,
              sender:    args[1] as string,
              recipient: args[2] as string,
              amount:    args[3] as bigint,
              fee:       args[4] as bigint,
              netAmount: args[5] as bigint,
              timestamp: args[6] as bigint,
            },
            blockNumber,
            txHash
          );
          break;

        case "TransferCompleted":
          await this.handler.handleTransferCompleted(
            {
              txId:      args[0] as string,
              recipient: args[1] as string,
              netAmount: args[2] as bigint,
              timestamp: args[3] as bigint,
            },
            blockNumber,
            txHash
          );
          break;

        case "TransferCancelled":
          await this.handler.handleTransferCancelled(
            {
              txId:      args[0] as string,
              sender:    args[1] as string,
              amount:    args[2] as bigint,
              timestamp: args[3] as bigint,
            },
            blockNumber,
            txHash
          );
          break;

        default:
          logger.warn(`Unknown event: ${eventName}`);
      }
    } catch (error) {
      // Log but continue — one bad event must not stop the sync
      logger.error(`Failed to process historical event: ${eventName}`, {
        blockNumber,
        txHash,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}