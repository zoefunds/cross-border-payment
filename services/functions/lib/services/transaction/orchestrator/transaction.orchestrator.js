"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.transactionOrchestrator = exports.TransactionOrchestrator = void 0;
const logger_1 = require("../../../utils/logger");
const errors_1 = require("../../../utils/errors");
const transaction_repository_1 = require("../transaction.repository");
const ledger_service_1 = require("../../ledger/ledger.service");
const fx_service_1 = require("../../fx/fx.service");
const auth_service_1 = require("../../auth/auth.service");
const blockchain_service_1 = require("../../../blockchain/blockchain.service");
const env_1 = require("../../../config/env");
const logger = (0, logger_1.createContextLogger)({ service: "TransactionOrchestrator" });
const PLATFORM_FEE_PERCENTAGE = 0.015;
const NGN_TO_USDC_RATE = 0.00065;
class TransactionOrchestrator {
    async initiate(senderId, request) {
        const { receiverId, sourceAmount, sourceCurrency, idempotencyKey } = request;
        logger.info("Initiating transaction", { senderId, receiverId, sourceAmount, sourceCurrency });
        if (sourceCurrency === "NGN") {
            if (sourceAmount < env_1.env.MIN_TRANSACTION_NGN) {
                throw new errors_1.AppError(`Minimum transaction is ${env_1.env.MIN_TRANSACTION_NGN} NGN`, "BELOW_MINIMUM");
            }
            if (sourceAmount > env_1.env.MAX_TRANSACTION_NGN) {
                throw new errors_1.AppError(`Maximum transaction is ${env_1.env.MAX_TRANSACTION_NGN} NGN`, "ABOVE_MAXIMUM");
            }
        }
        const [sender, receiver] = await Promise.all([
            auth_service_1.authService.getUserById(senderId),
            auth_service_1.authService.getUserById(receiverId),
        ]);
        if (!sender.isActive)
            throw new errors_1.AppError("Sender account is inactive", "ACCOUNT_INACTIVE");
        if (!receiver.isActive)
            throw new errors_1.AppError("Receiver account is inactive", "ACCOUNT_INACTIVE");
        // Validate receiver has a crypto wallet BEFORE creating transaction
        // This fails fast — no money moves until we know where to send USDC
        if (!receiver.primaryCryptoWallet) {
            throw new errors_1.AppError("Receiver has not configured a crypto wallet address. " +
                "They must add a wallet before receiving payments.", "RECEIVER_NO_WALLET", 422);
        }
        const fxRate = await fx_service_1.fxService.getRate("NGN/GHS");
        const platformFeeNgn = Math.ceil(sourceAmount * PLATFORM_FEE_PERCENTAGE);
        const amountAfterFee = sourceAmount - platformFeeNgn;
        const destinationAmount = Math.floor(amountAfterFee * fxRate.effectiveRate);
        const fees = {
            platformFeeNgn,
            networkFeeUsdc: 0.01,
            totalFeeNgn: platformFeeNgn,
            feePercentage: PLATFORM_FEE_PERCENTAGE,
        };
        const transaction = await transaction_repository_1.transactionRepository.create({
            type: "NGN_TO_GHS",
            status: "INITIATED",
            senderId,
            senderName: sender.fullName,
            senderCountry: sender.country,
            receiverId,
            receiverName: receiver.fullName,
            receiverCountry: receiver.country,
            sourceAmount,
            sourceCurrency,
            destinationAmount,
            destinationCurrency: "GHS",
            fees,
            fx: {
                pair: fxRate.pair,
                rate: fxRate.rate,
                usdcRate: NGN_TO_USDC_RATE,
                provider: fxRate.provider,
                lockedAt: fxRate.fetchedAt,
                expiresAt: fxRate.expiresAt,
            },
            idempotencyKey,
        });
        logger.info("Transaction created, starting pipeline", {
            transactionId: transaction.id,
            receiverWallet: receiver.primaryCryptoWallet,
        });
        this.processTransaction(transaction.id, senderId, receiver.primaryCryptoWallet).catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            logger.error("Transaction processing pipeline failed", {
                transactionId: transaction.id,
                error: msg,
            });
        });
        return transaction;
    }
    async debitNaira(transactionId, senderId, amount) {
        logger.info("Debiting NGN", { transactionId, senderId, amount });
        await ledger_service_1.ledgerService.debitWallet({
            userId: senderId,
            currency: "NGN",
            amount,
            transactionId,
            reason: "TRANSACTION_INITIATION",
            description: `NGN debit for transaction ${transactionId}`,
        });
        await transaction_repository_1.transactionRepository.transition(transactionId, "NAIRA_DEBITED", "system", "Naira debited");
    }
    async sendUsdc(transactionId, recipientAddress, ngnAmount) {
        logger.info("Sending USDC on-chain", {
            transactionId,
            recipientAddress,
        });
        const blockchain = (0, blockchain_service_1.getBlockchainService)();
        const usdcAmount = blockchain.ngnToUsdc(ngnAmount, NGN_TO_USDC_RATE);
        const result = await blockchain.initiatePayment(transactionId, recipientAddress, usdcAmount);
        await transaction_repository_1.transactionRepository.updateBlockchainRef(transactionId, {
            paymentId: result.paymentId,
            txHash: result.txHash,
            blockNumber: result.blockNumber,
            contractAddress: env_1.env.PAYMENT_CONTRACT_ADDRESS,
            usdcAmount: Number(usdcAmount),
            gasUsed: result.gasUsed,
        });
        await transaction_repository_1.transactionRepository.transition(transactionId, "USDC_SENT", "system", `USDC sent on-chain: ${result.txHash}`);
    }
    async releaseUsdc(transactionId) {
        logger.info("Releasing USDC on-chain", { transactionId });
        const blockchain = (0, blockchain_service_1.getBlockchainService)();
        await blockchain.releasePayment(transactionId);
    }
    async creditCedis(transactionId, receiverId, amount) {
        await ledger_service_1.ledgerService.creditWallet({
            userId: receiverId,
            currency: "GHS",
            amount,
            transactionId,
            reason: "TRANSACTION_COMPLETION",
            description: `GHS credit for transaction ${transactionId}`,
        });
        await transaction_repository_1.transactionRepository.transition(transactionId, "CEDIS_CREDITED", "system", "Cedis credited");
    }
    async complete(transactionId) {
        await transaction_repository_1.transactionRepository.transition(transactionId, "COMPLETED", "system", "Transaction completed");
        logger.info("Transaction completed", { transactionId });
    }
    async fail(transactionId, reason, shouldRefund, senderId, refundAmount) {
        logger.error("Transaction failing", { transactionId, reason });
        await transaction_repository_1.transactionRepository.transition(transactionId, "FAILED", "system", undefined, reason);
        if (shouldRefund && refundAmount > 0) {
            await this.refund(transactionId, senderId, refundAmount);
        }
    }
    async refund(transactionId, senderId, amount) {
        try {
            const blockchain = (0, blockchain_service_1.getBlockchainService)();
            await blockchain.refundPayment(transactionId, "Transaction failed");
        }
        catch (err) {
            logger.warn("On-chain refund failed, continuing with off-chain refund", {
                transactionId,
                error: err instanceof Error ? err.message : String(err),
            });
        }
        await ledger_service_1.ledgerService.creditWallet({
            userId: senderId,
            currency: "NGN",
            amount,
            transactionId,
            reason: "TRANSACTION_REFUND",
            description: `Refund for failed transaction ${transactionId}`,
        });
        await transaction_repository_1.transactionRepository.transition(transactionId, "REFUNDED", "system", "NGN refunded");
    }
    async processTransaction(transactionId, senderId, recipientAddress) {
        let transaction;
        try {
            transaction = await transaction_repository_1.transactionRepository.findById(transactionId);
        }
        catch (err) {
            logger.error("Transaction not found", {
                transactionId,
                error: err instanceof Error ? err.message : String(err),
            });
            return;
        }
        const { sourceAmount, destinationAmount, receiverId } = transaction;
        let nairaDebited = false;
        try {
            await this.debitNaira(transactionId, senderId, sourceAmount);
            nairaDebited = true;
            await this.sendUsdc(transactionId, recipientAddress, sourceAmount);
            await this.releaseUsdc(transactionId);
            await this.creditCedis(transactionId, receiverId, destinationAmount);
            await this.complete(transactionId);
        }
        catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            logger.error("Pipeline step failed", { transactionId, reason });
            await this.fail(transactionId, reason, nairaDebited, senderId, sourceAmount);
        }
    }
}
exports.TransactionOrchestrator = TransactionOrchestrator;
exports.transactionOrchestrator = new TransactionOrchestrator();
//# sourceMappingURL=transaction.orchestrator.js.map