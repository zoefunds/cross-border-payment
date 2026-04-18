import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "staging", "production"]).default("development"),
  APP_ENV: z.enum(["development", "staging", "production"]).default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  FIREBASE_PROJECT_ID: z.string().min(1).default("demo-crossborder"),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),

  BASE_RPC_URL: z.string().default("https://sepolia.base.org"),
  PAYMENT_CONTRACT_ADDRESS: z.string().optional(),
  TREASURY_WALLET_ADDRESS: z.string().optional(),
  TREASURY_PRIVATE_KEY: z.string().optional(),
  USDC_CONTRACT_ADDRESS: z.string().default("0x036CbD53842c5426634e7929541eC2318f3dCF7e"),

  FX_API_KEY: z.string().optional(),
  FX_API_URL: z.string().optional(),

  MAX_TRANSACTION_NGN: z.coerce.number().default(5_000_000),
  MIN_TRANSACTION_NGN: z.coerce.number().default(1_000),
  MAX_TRANSACTION_GHS: z.coerce.number().default(50_000),
  MIN_TRANSACTION_GHS: z.coerce.number().default(10),

  JWT_SECRET: z.string().optional(),
  ENCRYPTION_KEY: z.string().optional(),
});

const _parsed = envSchema.safeParse(process.env);

if (!_parsed.success) {
  console.error("❌ Invalid environment configuration:");
  console.error(_parsed.error.format());
  process.exit(1);
}

export const env = _parsed.data;
export type Env = z.infer<typeof envSchema>;
export const isProduction = env.NODE_ENV === "production";
export const isDevelopment = env.NODE_ENV === "development";
