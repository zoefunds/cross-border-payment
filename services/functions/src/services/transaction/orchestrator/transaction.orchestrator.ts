import { createContextLogger } from "../../../utils/logger";
import { AppError } from "../../../utils/errors";
import { transactionRepository } from "../transaction.repository";
import { ledgerService } from "../../ledger/ledger.service";
import { fxService } from "../../fx/fx.service";
import { authService } from "../../auth/auth.service";
import { getBlockchainService } from "../../../blockchain/blockchain.service";
import {
  TransactionModel,
  InitiateTransactionRequest,
  TransactionFees,
} from "../../../models/transaction.model";
import { env } from "../../../config/env";

const logger = createContextLogger({ service: "TransactionOrchestrator" });

const PLATFORM_FEE_PERCENTAGE = 0.015;
const NGN_TO_USDC_RATE = 0.00065;

export class TransactionOrchestrator {
  async initiate(
    senderId: string,
    request: InitiateTransactionRequest
  ): Promise<TransactionModel> {
    const { receiverId, sourceAmount, sourceCurrency, idempotencyKey } = request;

    logger.info("Initiating transaction", { senderId, receiverId, sourceAmount, sourceCurrency });

    if (sourceCurrency === "NGN") {
      if (sourceAmount < env.MIN_TRANSACTION_NGN) {
        throw new AppError(`Minimum transaction is ${env.MIN_TRANSACTION_NGN} NGN`, "BELOW_MINIMUM");
      }
      if (sourceAmount > env.MAX_TRANSACTION_NGN) {
        throw new AppError(`Maximum transaction is ${env.MAX_TRANSACTION_NGN} NGN`, "ABOVE_MAXIMUM");
      }
    }

    const [sender, receiver] = await Promise.all([
      authService.getUserById(senderId),
      authService.getUserById(receiverId),
    ]);

    if (!sender.isActive) throw new AppError("Sender account is inactive", "ACCOUNT_INACTIVE");
    if (!receiver.isActive) throw new AppError("Receiver account is inactive", "ACCOUNT_INACTIVE");

    // Validate receiver has a crypto wallet BEFORE creating transaction
    // This fails fast — no money moves until we know where to send USDC
    if (!receiver.primaryCryptoWallet) {
      throw new AppError(
        "Receiver has not configured a crypto wallet address. " +
        "They must add a wallet before receiving payments.",
        "RECEIVER_NO_WALLET",
        422
      );
    }

    const fxRate = await fxService.getRate("NGN/GHS");

    const platformFeeNgn = Math.ceil(sourceAmount * PLATFORM_FEE_PERCENTAGE);
    const amountAfterFee = sourceAmount - platformFeeNgn;
    const destinationAmount = Math.floor(amountAfterFee * fxRate.effectiveRate);

    const fees: TransactionFees = {
      platformFeeNgn,
      networkFeeUsdc: 0.01,
      totalFeeNgn: platformFeeNgn,
      feePercentage: PLATFORM_FEE_PERCENTAGE,
    };

    const transaction = await transactionRepository.create({
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

    this.processTransaction(
      transaction.id,
      senderId,
      receiver.primaryCryptoWallet
    ).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("Transaction processing pipeline failed", {
        transactionId: transaction.id,
        error: msg,
      });
    });

    return transaction;
  }

  private async debitNaira(
    transactionId: string,
    senderId: string,
    amount: number
  ): Promise<void> {
    logger.info("Debiting NGN", { transactionId, senderId, amount });
    await ledgerService.debitWallet({
      userId: senderId,
      currency: "NGN",
      amount,
      transactionId,
      reason: "TRANSACTION_INITIATION",
      description: `NGN debit for transaction ${transactionId}`,
    });
    await transactionRepository.transition(
      transactionId, "NAIRA_DEBITED", "system", "Naira debited"
    );
  }

  private async sendUsdc(
    transactionId: string,
    recipientAddress: string,
    ngnAmount: number
  ): Promise<void> {
    logger.info("Sending USDC on-chain", {
      transactionId,
      recipientAddress,
    });

    const blockchain = getBlockchainService();
    const usdcAmount = blockchain.ngnToUsdc(ngnAmount, NGN_TO_USDC_RATE);

    const result = await blockchain.initiatePayment(
      transactionId,
      recipientAddress,
      usdcAmount
    );

    await transactionRepository.updateBlockchainRef(transactionId, {
      txHash: result.txHash,
      blockNumber: result.blockNumber,
      contractAddress: env.PAYMENT_CONTRACT_ADDRESS,
      usdcAmount: Number(usdcAmount),
      gasUsed: result.gasUsed,
    });

    await transactionRepository.transition(
      transactionId, "USDC_SENT", "system",
      `USDC sent on-chain: ${result.txHash}`
    );
  }

  private async releaseUsdc(transactionId: string): Promise<void> {
    logger.info("Releasing USDC on-chain", { transactionId });
    const blockchain = getBlockchainService();
    await blockchain.releasePayment(transactionId);
  }

  private async creditCedis(
    transactionId: string,
    receiverId: string,
    amount: number
  ): Promise<void> {
    await ledgerService.creditWallet({
      userId: receiverId,
      currency: "GHS",
      amount,
      transactionId,
      reason: "TRANSACTION_COMPLETION",
      description: `GHS credit for transaction ${transactionId}`,
    });
    await transactionRepository.transition(
      transactionId, "CEDIS_CREDITED", "system", "Cedis credited"
    );
  }

  private async complete(transactionId: string): Promise<void> {
    await transactionRepository.transition(
      transactionId, "COMPLETED", "system", "Transaction completed"
    );
    logger.info("Transaction completed", { transactionId });
  }

  private async fail(
    transactionId: string,
    reason: string,
    shouldRefund: boolean,
    senderId: string,
    refundAmount: number
  ): Promise<void> {
    logger.error("Transaction failing", { transactionId, reason });
    await transactionRepository.transition(
      transactionId, "FAILED", "system", undefined, reason
    );
    if (shouldRefund && refundAmount > 0) {
      await this.refund(transactionId, senderId, refundAmount);
    }
  }

  private async refund(
    transactionId: string,
    senderId: string,
    amount: number
  ): Promise<void> {
    try {
      const blockchain = getBlockchainService();
      await blockchain.refundPayment(transactionId, "Transaction failed");
    } catch (err) {
      logger.warn("On-chain refund failed, continuing with off-chain refund", {
        transactionId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    await ledgerService.creditWallet({
      userId: senderId,
      currency: "NGN",
      amount,
      transactionId,
      reason: "TRANSACTION_REFUND",
      description: `Refund for failed transaction ${transactionId}`,
    });

    await transactionRepository.transition(
      transactionId, "REFUNDED", "system", "NGN refunded"
    );
  }

  async processTransaction(
    transactionId: string,
    senderId: string,
    recipientAddress: string
  ): Promise<void> {
    let transaction: TransactionModel;

    try {
      transaction = await transactionRepository.findById(transactionId);
    } catch (err: unknown) {
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
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      logger.error("Pipeline step failed", { transactionId, reason });
      await this.fail(transactionId, reason, nairaDebited, senderId, sourceAmount);
    }
  }
}

export const transactionOrchestrator = new TransactionOrchestrator();
