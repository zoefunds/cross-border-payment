"use strict";
/**
 * Relayer Webhook Routes
 * Protected by x-relayer-secret header.
 *
 * POST /relayer/health
 * POST /relayer/transfer-initiated
 * POST /relayer/transfer-completed
 * POST /relayer/transfer-cancelled
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.relayerRouter = void 0;
const express_1 = require("express");
const transaction_repository_1 = require("../services/transaction/transaction.repository");
const ledger_service_1 = require("../services/ledger/ledger.service");
const logger_1 = require("../utils/logger");
const response_1 = require("../utils/response");
const env_1 = require("../config/env");
const logger = (0, logger_1.createContextLogger)({ service: "RelayerRoutes" });
exports.relayerRouter = (0, express_1.Router)();
// ── Auth ──────────────────────────────────────────────────────────────────────
function requireRelayerSecret(req, res, next) {
    const secret = req.headers["x-relayer-secret"];
    if (!env_1.env.RELAYER_API_SECRET) {
        logger.warn("RELAYER_API_SECRET not set — skipping auth (dev only)");
        next();
        return;
    }
    if (!secret || secret !== env_1.env.RELAYER_API_SECRET) {
        logger.warn("Relayer request rejected — bad secret", { ip: req.ip, path: req.path });
        (0, response_1.sendError)(res, "Unauthorized", 401, "UNAUTHORIZED");
        return;
    }
    next();
}
exports.relayerRouter.use(requireRelayerSecret);
// ── GET /relayer/health ───────────────────────────────────────────────────────
exports.relayerRouter.get("/health", (_req, res) => {
    (0, response_1.sendSuccess)(res, { status: "ok", service: "relayer-webhook" });
});
// ── POST /relayer/transfer-initiated ─────────────────────────────────────────
exports.relayerRouter.post("/transfer-initiated", async (req, res) => {
    const { txId, blockNumber, txHash, netAmount } = req.body;
    logger.info("Relayer: TransferInitiated", { txId, txHash, blockNumber });
    try {
        const transaction = await transaction_repository_1.transactionRepository.findByTxHash(txHash).catch(() => null);
        if (!transaction) {
            logger.warn("No Firebase tx for txHash", { txHash, txId });
            res.status(200).json({ action: "pending", message: "Not tracked" });
            return;
        }
        if (transaction.status !== "USDC_SENT") {
            logger.warn("Unexpected state for transfer-initiated", { id: transaction.id, status: transaction.status });
            res.status(200).json({ action: "pending", message: "Unexpected state" });
            return;
        }
        await transaction_repository_1.transactionRepository.updateBlockchainRef(transaction.id, {
            paymentId: txId,
            txHash,
            blockNumber,
            contractAddress: env_1.env.PAYMENT_CONTRACT_ADDRESS,
            usdcAmount: Number(netAmount),
            gasUsed: "0",
        });
        logger.info("TransferInitiated confirmed — instructing complete", { id: transaction.id });
        res.status(200).json({ action: "complete", message: "Proceed to complete transfer" });
    }
    catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error("transfer-initiated error", { error: msg, txId });
        res.status(200).json({ action: "cancel", message: `Error: ${msg}` });
    }
});
// ── POST /relayer/transfer-completed ─────────────────────────────────────────
exports.relayerRouter.post("/transfer-completed", async (req, res) => {
    const { txId, txHash } = req.body;
    logger.info("Relayer: TransferCompleted", { txId, txHash });
    try {
        const transaction = await transaction_repository_1.transactionRepository.findByOnChainId(txId).catch(() => null) ??
            await transaction_repository_1.transactionRepository.findByTxHash(txHash).catch(() => null);
        if (!transaction) {
            logger.warn("No Firebase tx for TransferCompleted", { txId });
            res.status(200).json({ message: "Not tracked" });
            return;
        }
        if (transaction.status === "COMPLETED") {
            res.status(200).json({ message: "Already completed" });
            return;
        }
        await ledger_service_1.ledgerService.creditWallet({
            userId: transaction.receiverId,
            currency: "GHS",
            amount: transaction.destinationAmount,
            transactionId: transaction.id,
            reason: "TRANSACTION_COMPLETION",
            description: `GHS credit — on-chain confirmed (${txHash})`,
        });
        await transaction_repository_1.transactionRepository.transition(transaction.id, "CEDIS_CREDITED", "relayer", `On-chain settlement confirmed: ${txHash}`);
        await transaction_repository_1.transactionRepository.transition(transaction.id, "COMPLETED", "relayer", "Transaction fully completed");
        logger.info("Transaction COMPLETED via relayer", { id: transaction.id, txHash });
        res.status(200).json({ message: "Transaction completed" });
    }
    catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error("transfer-completed error", { error: msg, txId });
        res.status(500).json({ error: msg });
    }
});
// ── POST /relayer/transfer-cancelled ─────────────────────────────────────────
exports.relayerRouter.post("/transfer-cancelled", async (req, res) => {
    const { txId, txHash } = req.body;
    logger.info("Relayer: TransferCancelled", { txId, txHash });
    try {
        const transaction = await transaction_repository_1.transactionRepository.findByOnChainId(txId).catch(() => null) ??
            await transaction_repository_1.transactionRepository.findByTxHash(txHash).catch(() => null);
        if (!transaction) {
            logger.warn("No Firebase tx for TransferCancelled", { txId });
            res.status(200).json({ message: "Not tracked" });
            return;
        }
        if (transaction.status === "REFUNDED" || transaction.status === "FAILED") {
            res.status(200).json({ message: "Already in terminal state" });
            return;
        }
        await transaction_repository_1.transactionRepository.transition(transaction.id, "FAILED", "relayer", undefined, `On-chain transfer cancelled: ${txHash}`);
        await ledger_service_1.ledgerService.creditWallet({
            userId: transaction.senderId,
            currency: "NGN",
            amount: transaction.sourceAmount,
            transactionId: transaction.id,
            reason: "TRANSACTION_REFUND",
            description: `NGN refund — cancellation confirmed (${txHash})`,
        });
        await transaction_repository_1.transactionRepository.transition(transaction.id, "REFUNDED", "relayer", "NGN refunded after on-chain cancellation");
        logger.info("Transaction REFUNDED via relayer", { id: transaction.id, txHash });
        res.status(200).json({ message: "Transaction refunded" });
    }
    catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error("transfer-cancelled error", { error: msg, txId });
        res.status(500).json({ error: msg });
    }
});
//# sourceMappingURL=relayer.routes.js.map