/**
 * Relayer Webhook Routes
 * Protected by x-relayer-secret header.
 *
 * POST /relayer/health
 * POST /relayer/transfer-initiated
 * POST /relayer/transfer-completed
 * POST /relayer/transfer-cancelled
 */
export declare const relayerRouter: import("express-serve-static-core").Router;
