import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
import * as path from "path";

// Load environment variables from .env
dotenv.config({ path: path.resolve(__dirname, ".env") });

// ─── Environment Validation ────────────────────────────────────────────────
// We validate at startup so deployments don't fail halfway through
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const BASE_TESTNET_RPC_URL = process.env.BASE_TESTNET_RPC_URL;
const BASESCAN_API_KEY = process.env.BASESCAN_API_KEY;

// Only enforce these during deployment tasks, not during compile/test
const isDeploymentTask =
  process.argv.includes("deploy") || process.argv.includes("verify");

if (isDeploymentTask) {
  if (!DEPLOYER_PRIVATE_KEY) {
    throw new Error("❌ DEPLOYER_PRIVATE_KEY is not set in .env");
  }
  if (!BASE_TESTNET_RPC_URL) {
    throw new Error("❌ BASE_TESTNET_RPC_URL is not set in .env");
  }
}

// ─── Config ────────────────────────────────────────────────────────────────
const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      evmVersion: "cancun",   // ← ADD THIS LINE
      viaIR: true,
    },
  },

  networks: {
    // ── Local development ──
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },

    // ── Base Sepolia Testnet ──
    baseTestnet: {
      url: BASE_TESTNET_RPC_URL ?? "",
      chainId: 84532, // Base Sepolia chain ID
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
      gasPrice: "auto",
      gas: "auto",
      // Retry config for network reliability
      timeout: 60000,
    },
  },

  // Contract verification on Basescan (Etherscan V2 API)
  etherscan: {
    apiKey: BASESCAN_API_KEY ?? "",
    customChains: [
      {
        network: "baseSepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api?chainid=84532",
          browserURL: "https://sepolia.basescan.org",
        },
      },
    ],
  },

  // Where compiled artifacts go
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },

  // Gas reporting during tests
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
    outputFile: "gas-report.txt",
    noColors: true,
  },

  // TypeChain — generates TypeScript types for contracts
  typechain: {
    outDir: "typechain-types",
    target: "ethers-v6",
  },
};

export default config;
