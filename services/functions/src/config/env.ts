function optionalEnv(key: string, fallback: string): string {
  return process.env[key]?.trim() ?? fallback;
}

export const env = {
  // ── Runtime ───────────────────────────────────────────────────────────────
  APP_ENV:  optionalEnv("APP_ENV",  "development"),
  NODE_ENV: optionalEnv("NODE_ENV", "development"),
  LOG_LEVEL: optionalEnv("LOG_LEVEL", "info"),

  // ── Firebase ──────────────────────────────────────────────────────────────
  FIREBASE_PROJECT_ID:  optionalEnv("FIREBASE_PROJECT_ID",  ""),
  FIREBASE_PRIVATE_KEY: optionalEnv("FIREBASE_PRIVATE_KEY", ""),
  FIREBASE_CLIENT_EMAIL: optionalEnv("FIREBASE_CLIENT_EMAIL", ""),

  // ── Blockchain — Base Sepolia (84532) ─────────────────────────────────────
  BASE_RPC_URL:             optionalEnv("BASE_RPC_URL", "https://sepolia.base.org"),
  TREASURY_PRIVATE_KEY:     optionalEnv("TREASURY_PRIVATE_KEY", ""),
  PAYMENT_CONTRACT_ADDRESS: optionalEnv("PAYMENT_CONTRACT_ADDRESS", "0xaC11528c36A05C904Bead5Ed3a74d4e40Dd38bfE"),
  USDC_CONTRACT_ADDRESS:    optionalEnv("USDC_CONTRACT_ADDRESS",    "0xB9a0E369995c03d966470D4E86b1bdbAD9bd7dc2"),

  // ── Relayer ───────────────────────────────────────────────────────────────
  RELAYER_API_SECRET: optionalEnv("RELAYER_API_SECRET", ""),

  // ── FX ────────────────────────────────────────────────────────────────────
  FX_API_URL:            optionalEnv("FX_API_URL", ""),
  FX_API_KEY:            optionalEnv("FX_API_KEY", ""),
  FX_RATE_CACHE_SECONDS: parseInt(optionalEnv("FX_RATE_CACHE_SECONDS", "300"), 10),

  // ── Transaction limits ────────────────────────────────────────────────────
  MIN_TRANSACTION_NGN: parseInt(optionalEnv("MIN_TRANSACTION_NGN", "500"),     10),
  MAX_TRANSACTION_NGN: parseInt(optionalEnv("MAX_TRANSACTION_NGN", "5000000"), 10),
} as const;
