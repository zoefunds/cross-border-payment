/**
 * Environment configuration — reads from process.env.
 * In production: set via Firebase Functions environment variables (Secret Manager).
 * In development: set via .env file loaded by the emulator.
 */
export declare const env: {
    readonly APP_ENV: string;
    readonly NODE_ENV: string;
    readonly LOG_LEVEL: string;
    readonly FIREBASE_PROJECT_ID: string;
    readonly FB_PRIVATE_KEY: string;
    readonly FB_CLIENT_EMAIL: string;
    readonly BASE_RPC_URL: string;
    readonly TREASURY_PRIVATE_KEY: string;
    readonly PAYMENT_CONTRACT_ADDRESS: string;
    readonly USDC_CONTRACT_ADDRESS: string;
    readonly RELAYER_API_SECRET: string;
    readonly FX_API_URL: string;
    readonly FX_API_KEY: string;
    readonly FX_RATE_CACHE_SECONDS: number;
    readonly MIN_TRANSACTION_NGN: number;
    readonly MAX_TRANSACTION_NGN: number;
};
