import { run, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DeploymentRecord {
  network: string;
  chainId: number;
  deployedAt: string;
  deployer: string;
  contracts: {
    MockUSDC: { address: string };
    Escrow: {
      address: string;
      constructorArgs: {
        usdcToken: string;
        relayer: string;
        feeRecipient: string;
        feeBasisPoints: number;
        initialOwner: string;
      };
    };
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function log(message: string): void {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${message}`);
}

/**
 * Load the most recent deployment for the current network
 */
function loadLatestDeployment(networkName: string): DeploymentRecord {
  const filePath = path.resolve(__dirname, "../deployments.json");

  if (!fs.existsSync(filePath)) {
    throw new Error(
      "deployments.json not found.\n" +
      "   Run deploy script first:\n" +
      "   npx hardhat run scripts/deploy.ts --network baseTestnet"
    );
  }

  const raw = fs.readFileSync(filePath, "utf-8");
  const all = JSON.parse(raw) as Record<string, DeploymentRecord[]>;
  const deployments = all[networkName];

  if (!deployments || deployments.length === 0) {
    throw new Error(
      `No deployments found for network: ${networkName}\n` +
      `   Available networks: ${Object.keys(all).join(", ")}`
    );
  }

  // Return most recent deployment
  return deployments[deployments.length - 1]!;
}

/**
 * Verify a single contract with retry logic
 * Basescan indexing can lag — retry helps
 */
async function verifyWithRetry(
  address: string,
  constructorArguments: unknown[],
  contractName: string,
  maxRetries = 3,
  delayMs = 5000
): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      log(`   Attempt ${attempt}/${maxRetries}...`);

      await run("verify:verify", {
        address,
        constructorArguments,
      });

      log(`   ✅ ${contractName} verified`);
      return;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);

      // Already verified — not an error
      if (message.includes("Already Verified")) {
        log(`   ✅ ${contractName} already verified`);
        return;
      }

      if (attempt < maxRetries) {
        log(`   ⚠️  Attempt ${attempt} failed: ${message}`);
        log(`   Retrying in ${delayMs / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      } else {
        throw new Error(
          `Failed to verify ${contractName} after ${maxRetries} attempts:\n${message}`
        );
      }
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  log("🔍 Starting contract verification...");
  log(`   Network: ${network.name}`);

  if (network.name === "localhost" || network.name === "hardhat") {
    log("⚠️  Skipping verification on local network");
    return;
  }

  if (!process.env.BASESCAN_API_KEY) {
    throw new Error(
      "❌ BASESCAN_API_KEY not set in .env\n" +
      "   Get one at: https://basescan.org/myapikey"
    );
  }

  // ── Load deployment record ───────────────────────────────────────────────
  const deployment = loadLatestDeployment(network.name);

  log(`   Deployed at: ${deployment.deployedAt}`);
  log(`   Deployer:    ${deployment.deployer}`);

  // ── Wait for Basescan to index (30s) ─────────────────────────────────────
  // Basescan indexes blocks with a delay — wait before verifying
  log("\n⏳ Waiting 30s for Basescan to index contracts...");
  await new Promise((resolve) => setTimeout(resolve, 30_000));

  // ── Verify MockUSDC ──────────────────────────────────────────────────────
  log("\n📋 Verifying MockUSDC...");
  log(`   Address: ${deployment.contracts.MockUSDC.address}`);

  await verifyWithRetry(
    deployment.contracts.MockUSDC.address,
    [deployment.deployer], // constructor arg: initialOwner
    "MockUSDC"
  );

  // ── Verify Escrow ────────────────────────────────────────────────────────
  log("\n📋 Verifying Escrow...");
  log(`   Address: ${deployment.contracts.Escrow.address}`);

  const escrowArgs = deployment.contracts.Escrow.constructorArgs;

  await verifyWithRetry(
    deployment.contracts.Escrow.address,
    [
      escrowArgs.usdcToken,
      escrowArgs.relayer,
      escrowArgs.feeRecipient,
      escrowArgs.feeBasisPoints,
      escrowArgs.initialOwner,
    ],
    "Escrow"
  );

  // ── Done ──────────────────────────────────────────────────────────────────
  log("\n🎉 Verification complete!");
  log("─".repeat(60));
  log(
    `   MockUSDC: https://sepolia.basescan.org/address/${deployment.contracts.MockUSDC.address}`
  );
  log(
    `   Escrow:   https://sepolia.basescan.org/address/${deployment.contracts.Escrow.address}`
  );
  log("─".repeat(60));
}

// ─── Entry Point ─────────────────────────────────────────────────────────────
main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    const message =
      error instanceof Error ? error.message : String(error);
    console.error(`\n❌ Verification failed:\n   ${message}`);
    process.exit(1);
  });
