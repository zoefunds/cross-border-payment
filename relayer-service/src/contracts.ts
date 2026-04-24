import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import { config } from "./config";
import { logger } from "./logger";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ContractInstances {
  provider:  ethers.JsonRpcProvider;
  wallet:    ethers.Wallet;
  escrow:    ethers.Contract;
  mockUSDC:  ethers.Contract;
}

// ─── Load ABI ─────────────────────────────────────────────────────────────────

function loadAbi(contractName: string): ethers.InterfaceAbi {
  const abiPath = path.resolve(
    __dirname,
    `../../abis/${contractName}.json`
  );

  if (!fs.existsSync(abiPath)) {
    throw new Error(
      `ABI file not found: ${abiPath}\n` +
      `   Run: npx ts-node scripts/exportAbis.ts`
    );
  }

  const raw = fs.readFileSync(abiPath, "utf-8");
  return JSON.parse(raw) as ethers.InterfaceAbi;
}

// ─── Build Contract Instances ─────────────────────────────────────────────────

export function buildContracts(): ContractInstances {
  logger.info("🔌 Connecting to blockchain...", {
    rpcUrl:  config.rpcUrl.slice(0, 30) + "...",
    chainId: config.chainId,
  });

  // ── Provider — read-only connection to the node ──────────────────────────
  const provider = new ethers.JsonRpcProvider(config.rpcUrl, {
    chainId: config.chainId,
    name:    "baseSepolia",
  });

  // ── Wallet — signs transactions (relayer key) ────────────────────────────
  const wallet = new ethers.Wallet(config.relayerPrivateKey, provider);

  logger.info("👛 Relayer wallet loaded", {
    address: wallet.address,
  });

  // ── Load ABIs ────────────────────────────────────────────────────────────
  const escrowAbi   = loadAbi("Escrow");
  const mockUSDCAbi = loadAbi("MockUSDC");

  // ── Escrow — connected with wallet (can send txs) ────────────────────────
  const escrow = new ethers.Contract(
    config.escrowContractAddress,
    escrowAbi,
    wallet
  );

  // ── MockUSDC — read-only (relayer only reads balances) ───────────────────
  const mockUSDC = new ethers.Contract(
    config.mockUsdcAddress,
    mockUSDCAbi,
    provider
  );

  logger.info("📄 Contracts loaded", {
    escrow:   config.escrowContractAddress,
    mockUSDC: config.mockUsdcAddress,
  });

  return { provider, wallet, escrow, mockUSDC };
}