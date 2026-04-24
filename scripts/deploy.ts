import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DeploymentRecord {
  network: string;
  chainId: number;
  deployedAt: string;
  deployer: string;
  contracts: {
    MockUSDC: {
      address: string;
      txHash: string;
      blockNumber: number;
    };
    Escrow: {
      address: string;
      txHash: string;
      blockNumber: number;
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

// ─── Config ───────────────────────────────────────────────────────────────────

/**
 * Deployment configuration.
 *
 * RELAYER_ADDRESS:
 *   This is the wallet that will run the relayer service (Step 6).
 *   It should be a SEPARATE wallet from the deployer.
 *   Set RELAYER_ADDRESS in your .env before deploying.
 *
 * FEE_RECIPIENT:
 *   Where protocol fees are collected.
 *   Can be a multisig in production.
 *
 * FEE_BASIS_POINTS:
 *   50 = 0.5% per transfer
 */
const DEPLOY_CONFIG = {
  feeBasisPoints: 50, // 0.5%
  // Fallback to deployer if not set — replace before mainnet
  relayerAddress:  process.env.RELAYER_ADDRESS   ?? "",
  feeRecipient:    process.env.FEE_RECIPIENT     ?? "",
  // How much MockUSDC to mint to deployer for testing
  initialMintAmount: BigInt(100_000) * BigInt(10 ** 6), // 100,000 USDC
} as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Log with timestamp — helpful when watching long deployments
 */
function log(message: string): void {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${message}`);
}

/**
 * Validate all required environment variables before spending gas
 */
function validateEnv(): void {
  const required = [
    "DEPLOYER_PRIVATE_KEY",
    "BASE_TESTNET_RPC_URL",
    "RELAYER_ADDRESS",
    "FEE_RECIPIENT",
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `❌ Missing required environment variables:\n${missing.map((k) => `   - ${k}`).join("\n")}\n` +
      `   Check your .env file.`
    );
  }
}

/**
 * Save deployment record to deployments.json
 * Keeps history of all deployments — useful for tracking and debugging
 */
function saveDeployment(record: DeploymentRecord): void {
  const filePath = path.resolve(__dirname, "../deployments.json");

  // Load existing deployments or start fresh
  let deployments: Record<string, DeploymentRecord[]> = {};

  if (fs.existsSync(filePath)) {
    const raw = fs.readFileSync(filePath, "utf-8");
    deployments = JSON.parse(raw) as Record<string, DeploymentRecord[]>;
  }

  // Append to network history
  const networkKey = record.network;
  if (!deployments[networkKey]) {
    deployments[networkKey] = [];
  }
  deployments[networkKey].push(record);

  fs.writeFileSync(filePath, JSON.stringify(deployments, null, 2));
  log(`📄 Deployment record saved to deployments.json`);
}

/**
 * Update .env file with deployed contract addresses
 * So the relayer service can pick them up automatically
 */
function updateEnvAddresses(
  mockUSDCAddress: string,
  escrowAddress: string
): void {
  const envPath = path.resolve(__dirname, "../.env");

  if (!fs.existsSync(envPath)) {
    log("⚠️  .env file not found — skipping address update");
    return;
  }

  let envContent = fs.readFileSync(envPath, "utf-8");

  // Replace or append MOCK_USDC_ADDRESS
  if (envContent.includes("MOCK_USDC_ADDRESS=")) {
    envContent = envContent.replace(
      /MOCK_USDC_ADDRESS=.*/,
      `MOCK_USDC_ADDRESS=${mockUSDCAddress}`
    );
  } else {
    envContent += `\nMOCK_USDC_ADDRESS=${mockUSDCAddress}`;
  }

  // Replace or append ESCROW_CONTRACT_ADDRESS
  if (envContent.includes("ESCROW_CONTRACT_ADDRESS=")) {
    envContent = envContent.replace(
      /ESCROW_CONTRACT_ADDRESS=.*/,
      `ESCROW_CONTRACT_ADDRESS=${escrowAddress}`
    );
  } else {
    envContent += `\nESCROW_CONTRACT_ADDRESS=${escrowAddress}`;
  }

  fs.writeFileSync(envPath, envContent);
  log(`📝 .env updated with contract addresses`);
}

// ─── Main Deploy Function ─────────────────────────────────────────────────────

async function main(): Promise<void> {
  log("🚀 Starting deployment...");
  log(`   Network: ${network.name}`);

  // ── Validate env (skip for local network) ───────────────────────────────
  if (network.name !== "localhost" && network.name !== "hardhat") {
    validateEnv();
  }

  // ── Get deployer ─────────────────────────────────────────────────────────
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();

  log(`   Deployer: ${deployerAddress}`);

  // ── Check deployer balance ───────────────────────────────────────────────
  const balance = await ethers.provider.getBalance(deployerAddress);
  const balanceEth = ethers.formatEther(balance);
  log(`   Balance: ${balanceEth} ETH`);

  if (balance === 0n) {
    throw new Error(
      "❌ Deployer has no ETH. " +
      "Get testnet ETH from https://faucet.base.org"
    );
  }

  // ── Resolve addresses ────────────────────────────────────────────────────
  // On local network, fall back to deployer address for relayer and fee recipient
  const isLocal =
    network.name === "localhost" || network.name === "hardhat";

  const relayerAddress = isLocal
    ? deployerAddress
    : DEPLOY_CONFIG.relayerAddress;

  const feeRecipientAddress = isLocal
    ? deployerAddress
    : DEPLOY_CONFIG.feeRecipient;

  log(`   Relayer: ${relayerAddress}`);
  log(`   Fee Recipient: ${feeRecipientAddress}`);
  log(`   Fee: ${DEPLOY_CONFIG.feeBasisPoints} bps (${DEPLOY_CONFIG.feeBasisPoints / 100}%)`);

  // ────────────────────────────────────────────────────────────────────────
  // STEP 1: Deploy MockUSDC
  // ────────────────────────────────────────────────────────────────────────
  log("\n📦 Deploying MockUSDC...");

  const MockUSDCFactory = await ethers.getContractFactory("MockUSDC");
  const mockUSDC = await MockUSDCFactory.deploy(deployerAddress);
  await mockUSDC.waitForDeployment();

  const mockUSDCAddress = await mockUSDC.getAddress();
  const mockUSDCTx = mockUSDC.deploymentTransaction();

  if (!mockUSDCTx) throw new Error("MockUSDC deployment transaction not found");

  const mockUSDCReceipt = await mockUSDCTx.wait(1);
  if (!mockUSDCReceipt) throw new Error("MockUSDC receipt not found");

  log(`   ✅ MockUSDC deployed at: ${mockUSDCAddress}`);
  log(`   TX: ${mockUSDCTx.hash}`);
  log(`   Block: ${mockUSDCReceipt.blockNumber}`);

  // ────────────────────────────────────────────────────────────────────────
  // STEP 2: Mint initial USDC to deployer (for testing)
  // ────────────────────────────────────────────────────────────────────────
  log("\n💰 Minting initial USDC to deployer...");

  const mintTx = await mockUSDC.mint(
    deployerAddress,
    DEPLOY_CONFIG.initialMintAmount
  );
  await mintTx.wait(1);

  const mintedHuman =
    Number(DEPLOY_CONFIG.initialMintAmount) / 10 ** 6;
  log(`   ✅ Minted ${mintedHuman.toLocaleString()} mUSDC to deployer`);

  // ────────────────────────────────────────────────────────────────────────
  // STEP 3: Deploy Escrow
  // ────────────────────────────────────────────────────────────────────────
  log("\n📦 Deploying Escrow...");

  const EscrowFactory = await ethers.getContractFactory("Escrow");
  const escrow = await EscrowFactory.deploy(
    mockUSDCAddress,
    relayerAddress,
    feeRecipientAddress,
    DEPLOY_CONFIG.feeBasisPoints,
    deployerAddress
  );
  await escrow.waitForDeployment();

  const escrowAddress = await escrow.getAddress();
  const escrowTx = escrow.deploymentTransaction();

  if (!escrowTx) throw new Error("Escrow deployment transaction not found");

  const escrowReceipt = await escrowTx.wait(1);
  if (!escrowReceipt) throw new Error("Escrow receipt not found");

  log(`   ✅ Escrow deployed at: ${escrowAddress}`);
  log(`   TX: ${escrowTx.hash}`);
  log(`   Block: ${escrowReceipt.blockNumber}`);

  // ────────────────────────────────────────────────────────────────────────
  // STEP 4: Verify deployment state
  // ────────────────────────────────────────────────────────────────────────
  log("\n🔍 Verifying deployment state...");

  const escrowRelayer      = await escrow.relayer();
  const escrowFeeRecipient = await escrow.feeRecipient();
  const escrowFeeBps       = await escrow.feeBasisPoints();
  const escrowUSDC         = await escrow.usdcToken();
  const deployerBalance    = await mockUSDC.balanceOf(deployerAddress);

  const checks = [
    { name: "Escrow relayer",       expected: relayerAddress,       actual: escrowRelayer },
    { name: "Escrow feeRecipient",  expected: feeRecipientAddress,  actual: escrowFeeRecipient },
    { name: "Escrow usdcToken",     expected: mockUSDCAddress,      actual: escrowUSDC },
  ];

  let allPassed = true;
  for (const check of checks) {
    const passed =
      check.expected.toLowerCase() === check.actual.toLowerCase();
    log(`   ${passed ? "✅" : "❌"} ${check.name}: ${check.actual}`);
    if (!passed) {
      allPassed = false;
      log(`      Expected: ${check.expected}`);
    }
  }

  log(
    `   ✅ Escrow feeBasisPoints: ${escrowFeeBps} bps`
  );
  log(
    `   ✅ Deployer mUSDC balance: ${
      Number(deployerBalance) / 10 ** 6
    } mUSDC`
  );

  if (!allPassed) {
    throw new Error("❌ Deployment verification failed. Check logs above.");
  }

  // ────────────────────────────────────────────────────────────────────────
  // STEP 5: Save deployment record
  // ────────────────────────────────────────────────────────────────────────
  const chainId = Number((await ethers.provider.getNetwork()).chainId);

  const deploymentRecord: DeploymentRecord = {
    network:     network.name,
    chainId,
    deployedAt:  new Date().toISOString(),
    deployer:    deployerAddress,
    contracts: {
      MockUSDC: {
        address:     mockUSDCAddress,
        txHash:      mockUSDCTx.hash,
        blockNumber: mockUSDCReceipt.blockNumber,
      },
      Escrow: {
        address:     escrowAddress,
        txHash:      escrowTx.hash,
        blockNumber: escrowReceipt.blockNumber,
        constructorArgs: {
          usdcToken:       mockUSDCAddress,
          relayer:         relayerAddress,
          feeRecipient:    feeRecipientAddress,
          feeBasisPoints:  DEPLOY_CONFIG.feeBasisPoints,
          initialOwner:    deployerAddress,
        },
      },
    },
  };

  saveDeployment(deploymentRecord);

  // ── Update .env with addresses ───────────────────────────────────────────
  updateEnvAddresses(mockUSDCAddress, escrowAddress);

  // ────────────────────────────────────────────────────────────────────────
  // DONE
  // ────────────────────────────────────────────────────────────────────────
  log("\n🎉 Deployment complete!");
  log("─".repeat(60));
  log(`   MockUSDC : ${mockUSDCAddress}`);
  log(`   Escrow   : ${escrowAddress}`);
  log("─".repeat(60));

  if (!isLocal) {
    log("\n⏳ Next step: verify contracts on Basescan");
    log(
      `   npx hardhat run scripts/verify.ts --network baseTestnet`
    );
  }
}

// ─── Entry Point ─────────────────────────────────────────────────────────────
main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    const message =
      error instanceof Error ? error.message : String(error);
    console.error(`\n❌ Deployment failed:\n   ${message}`);
    process.exit(1);
  });