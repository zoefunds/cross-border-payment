import * as dotenv from "dotenv";
import * as path from "path";

// Load .env from blockchain/ root (one level up from relayer-service/)
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RelayerConfig {
  // Blockchain
  rpcUrl:                string;
  relayerPrivateKey:     string;
  mockUsdcAddress:       string;
  escrowContractAddress: string;
  chainId:               number;

  // Backend
  backendApiUrl:    string;
  relayerApiSecret: string;

  // Operational
  logLevel:              string;
  confirmations:         number;
  pollingIntervalMs:     number;
  maxRetries:            number;
  retryDelayMs:          number;
}

// ─── Validation ───────────────────────────────────────────────────────────────

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value || value.trim() === "") {
    throw new Error(
      `❌ Missing required environment variable: ${key}\n` +
      `   Check your .env file at blockchain/.env`
    );
  }
  return value.trim();
}

function optionalEnv(key: string, fallback: string): string {
  return process.env[key]?.trim() ?? fallback;
}

// ─── Build Config ─────────────────────────────────────────────────────────────

function buildConfig(): RelayerConfig {
  return {
    // ── Blockchain ─────────────────────────────────────────────────────────
    rpcUrl:                requireEnv("BASE_TESTNET_RPC_URL"),
    relayerPrivateKey:     requireEnv("RELAYER_PRIVATE_KEY"),
    mockUsdcAddress:       requireEnv("MOCK_USDC_ADDRESS"),
    escrowContractAddress: requireEnv("ESCROW_CONTRACT_ADDRESS"),
    chainId:               84532, // Base Sepolia

    // ── Backend ────────────────────────────────────────────────────────────
    backendApiUrl:    requireEnv("BACKEND_API_URL"),
    relayerApiSecret: requireEnv("RELAYER_API_SECRET"),

    // ── Operational ────────────────────────────────────────────────────────
    logLevel:          optionalEnv("LOG_LEVEL",           "info"),
    confirmations:     parseInt(optionalEnv("CONFIRMATIONS",      "2"), 10),
    pollingIntervalMs: parseInt(optionalEnv("POLLING_INTERVAL_MS","4000"), 10),
    maxRetries:        parseInt(optionalEnv("MAX_RETRIES",        "5"), 10),
    retryDelayMs:      parseInt(optionalEnv("RETRY_DELAY_MS",     "2000"), 10),
  };
}

// Export singleton — validated once at startup
export const config: RelayerConfig = buildConfig();