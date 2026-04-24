import { logger }          from "./logger";
import { config }          from "./config";
import { buildContracts }  from "./contracts";
import { BackendService }  from "./services/backendService";
import { TransferHandler } from "./handlers/transferHandler";
import { EscrowListener }  from "./listeners/escrowListener";
import { HistoricalSync }  from "./listeners/historicalSync";
import { CheckpointStore } from "./state/checkpointStore";

// ─── Relayer Entry Point ──────────────────────────────────────────────────────

async function main(): Promise<void> {
  logger.info("🚀 XBorder Relayer Service starting...", {
    network:  "Base Sepolia",
    chainId:  config.chainId,
    escrow:   config.escrowContractAddress,
    logLevel: config.logLevel,
  });

  // ── Step 1: Build contract instances ──────────────────────────────────────
  const { provider, wallet, escrow, mockUSDC } = buildContracts();

  // ── Step 2: Verify relayer wallet has ETH for gas ─────────────────────────
  const balance    = await provider.getBalance(wallet.address);
  const balanceEth = (Number(balance) / 1e18).toFixed(6);

  logger.info("💳 Relayer wallet balance", {
    address: wallet.address,
    balance: `${balanceEth} ETH`,
  });

  if (balance < BigInt(1e15)) {
    logger.warn(
      "⚠️  Low ETH balance on relayer wallet. Top up to avoid failed transactions.",
      { address: wallet.address }
    );
  }

  // ── Step 3: Verify escrow contract is reachable ───────────────────────────
  const escrowAddress   = await escrow.getAddress();
  const contractBalance = await mockUSDC.balanceOf(escrowAddress);

  logger.info("📊 Escrow contract state", {
    address:     escrowAddress,
    usdcBalance: (Number(contractBalance) / 1e6).toFixed(2) + " mUSDC",
  });

  // ── Step 4: Init backend service + health check ───────────────────────────
  const backendService = new BackendService();

  logger.info("🔗 Checking backend connectivity...", {
    url: config.backendApiUrl,
  });

  const backendHealthy = await backendService.healthCheck();

  if (backendHealthy) {
    logger.info("✅ Backend is reachable");
  } else {
    logger.warn(
      "⚠️  Backend health check failed. " +
      "Relayer will start but transfers may default to cancel."
    );
  }

  // ── Step 5: Init checkpoint store ─────────────────────────────────────────
  const checkpoint = new CheckpointStore("baseSepolia");

  // ── Step 6: Historical sync — replay missed events ────────────────────────
  logger.info("🔄 Running historical sync...");

  const historicalSync = new HistoricalSync(
    escrow,
    provider,
    new TransferHandler(escrow, backendService),
    checkpoint
  );

  const syncedToBlock = await historicalSync.sync();

  logger.info("✅ Historical sync complete", { syncedToBlock });

  // ── Step 7: Start real-time listener from synced block ────────────────────
  const handler  = new TransferHandler(escrow, backendService);
  const listener = new EscrowListener(escrow, provider, handler, checkpoint);

  await listener.start(syncedToBlock);

  // ── Step 8: Graceful shutdown ─────────────────────────────────────────────
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`\n📴 Received ${signal} — shutting down gracefully...`);
    await listener.stop();
    provider.destroy();
    logger.info("👋 Relayer shutdown complete");
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT",  () => void shutdown("SIGINT"));

  // ── Step 9: Heartbeat every 60s ───────────────────────────────────────────
  setInterval(() => {
    logger.info("💓 Relayer heartbeat — listening for events", {
      escrow:  config.escrowContractAddress,
      network: "Base Sepolia",
    });
  }, 60_000);

  logger.info("✅ Relayer fully operational — waiting for events...");
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  logger.error(`💥 Fatal error during startup:\n${message}`);
  process.exit(1);
});