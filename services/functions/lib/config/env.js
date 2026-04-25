"use strict";
/**
 * Environment configuration — reads from process.env.
 * In production: set via Firebase Functions environment variables (Secret Manager).
 * In development: set via .env file loaded by the emulator.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
function get(key, fallback = "") {
    return process.env[key]?.trim() ?? fallback;
}
exports.env = {
    APP_ENV: get("APP_ENV", "development"),
    NODE_ENV: get("NODE_ENV", "development"),
    LOG_LEVEL: get("LOG_LEVEL", "info"),
    FIREBASE_PROJECT_ID: get("FIREBASE_PROJECT_ID", "cross-border-3a994"),
    FB_PRIVATE_KEY: get("FB_PRIVATE_KEY", ""),
    FB_CLIENT_EMAIL: get("FB_CLIENT_EMAIL", ""),
    BASE_RPC_URL: get("BASE_RPC_URL", "https://sepolia.base.org"),
    TREASURY_PRIVATE_KEY: get("TREASURY_PRIVATE_KEY", ""),
    PAYMENT_CONTRACT_ADDRESS: get("PAYMENT_CONTRACT_ADDRESS", "0x6793801d231Dceb2bC5c558721fC8Ccb1fE38B28"),
    USDC_CONTRACT_ADDRESS: get("USDC_CONTRACT_ADDRESS", "0xc57364Ed661dEb72587D4edC019B5606401A99e7"),
    RELAYER_API_SECRET: get("RELAYER_API_SECRET", ""),
    FX_API_URL: get("FX_API_URL", ""),
    FX_API_KEY: get("FX_API_KEY", ""),
    FX_RATE_CACHE_SECONDS: parseInt(get("FX_RATE_CACHE_SECONDS", "300"), 10),
    MIN_TRANSACTION_NGN: parseInt(get("MIN_TRANSACTION_NGN", "500"), 10),
    MAX_TRANSACTION_NGN: parseInt(get("MAX_TRANSACTION_NGN", "5000000"), 10),
};
//# sourceMappingURL=env.js.map