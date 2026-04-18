/**
 * Blockchain Service
 *
 * Connects to Base Sepolia and interacts with the CrossBorderPayment contract.
 * Handles:
 *   - Approving USDC spend
 *   - Initiating on-chain payments
 *   - Releasing payments to recipients
 *   - Refunding failed payments
 *   - Retry logic for failed transactions
 */

import { ethers } from "ethers";
import { createContextLogger } from "../utils/logger";
import { AppError } from "../utils/errors";
import { env } from "../config/env";
import { CROSS_BORDER_PAYMENT_ABI, USDC_ABI } from "./CrossBorderPayment.abi";

const logger = createContextLogger({ service: "BlockchainService" });

// USDC has 6 decimals
const USDC_DECIMALS = 6;

// Max retries for failed transactions
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

export interface OnChainPaymentResult {
  txHash: string;
  blockNumber: number;
  gasUsed: string;
  paymentId: string;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  retries = MAX_RETRIES
): Promise<T> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isLast = attempt === retries;
      logger.warn(`${label} failed (attempt ${attempt}/${retries})`, {
        error: error instanceof Error ? error.message : String(error),
        isLast,
      });
      if (isLast) throw error;
      await sleep(RETRY_DELAY_MS * attempt);
    }
  }
  throw new Error(`${label} failed after ${retries} attempts`);
}

export class BlockchainService {
  private provider: ethers.JsonRpcProvider;
  private signer: ethers.Wallet;
  private contract: ethers.Contract;
  private usdcContract: ethers.Contract;

  constructor() {
    if (!env.BASE_RPC_URL) {
      throw new AppError("BASE_RPC_URL is required", "CONFIG_ERROR");
    }
    if (!env.TREASURY_PRIVATE_KEY) {
      throw new AppError("TREASURY_PRIVATE_KEY is required", "CONFIG_ERROR");
    }
    if (!env.PAYMENT_CONTRACT_ADDRESS) {
      throw new AppError("PAYMENT_CONTRACT_ADDRESS is required", "CONFIG_ERROR");
    }

    this.provider = new ethers.JsonRpcProvider(env.BASE_RPC_URL);
    this.signer = new ethers.Wallet(env.TREASURY_PRIVATE_KEY, this.provider);

    this.contract = new ethers.Contract(
      env.PAYMENT_CONTRACT_ADDRESS,
      CROSS_BORDER_PAYMENT_ABI,
      this.signer
    );

    this.usdcContract = new ethers.Contract(
      env.USDC_CONTRACT_ADDRESS,
      USDC_ABI,
      this.signer
    );

    logger.info("BlockchainService initialized", {
      contractAddress: env.PAYMENT_CONTRACT_ADDRESS,
      treasuryAddress: this.signer.address,
      network: env.BASE_RPC_URL,
    });
  }

  /**
   * Convert NGN amount to USDC using the FX rate.
   * USDC has 6 decimals.
   */
  ngnToUsdc(ngnAmount: number, ngnToUsdcRate: number): bigint {
    const usdcAmount = ngnAmount * ngnToUsdcRate;
    return BigInt(Math.floor(usdcAmount * 10 ** USDC_DECIMALS));
  }

  /**
   * Generate a bytes32 payment ID from the Firebase transaction ID.
   */
  generatePaymentId(firebaseTxId: string): string {
    return ethers.keccak256(ethers.toUtf8Bytes(firebaseTxId));
  }

  /**
   * Get treasury USDC balance.
   */
  async getTreasuryBalance(): Promise<bigint> {
    return await this.usdcContract.balanceOf(this.signer.address) as bigint;
  }

  /**
   * Ensure the contract has enough USDC allowance from treasury.
   */
  async ensureAllowance(requiredAmount: bigint): Promise<void> {
    const allowance = await this.usdcContract.allowance(
      this.signer.address,
      env.PAYMENT_CONTRACT_ADDRESS
    ) as bigint;

    if (allowance < requiredAmount) {
      logger.info("Approving USDC spend", {
        required: requiredAmount.toString(),
        current: allowance.toString(),
      });

      const approveTx = await withRetry(
        () => this.usdcContract.approve(
          env.PAYMENT_CONTRACT_ADDRESS,
          ethers.MaxUint256
        ) as Promise<ethers.TransactionResponse>,
        "USDC approve"
      );

      await approveTx.wait(1);
      logger.info("USDC approval confirmed", { txHash: approveTx.hash });
    }
  }

  /**
   * Initiate payment on-chain.
   * Called after NGN is debited from sender wallet.
   */
  async initiatePayment(
    firebaseTxId: string,
    recipientAddress: string,
    usdcAmount: bigint
  ): Promise<OnChainPaymentResult> {
    logger.info("Initiating on-chain payment", {
      firebaseTxId,
      recipientAddress,
      usdcAmount: usdcAmount.toString(),
    });

    // Ensure treasury has enough balance
    const balance = await this.getTreasuryBalance();
    const feeAmount = (usdcAmount * BigInt(150)) / BigInt(10_000);
    const totalRequired = usdcAmount + feeAmount;

    if (balance < totalRequired) {
      throw new AppError(
        `Insufficient USDC balance. Have: ${balance}, Need: ${totalRequired}`,
        "INSUFFICIENT_USDC_BALANCE",
        422
      );
    }

    // Ensure allowance
    await this.ensureAllowance(totalRequired);

    const paymentId = this.generatePaymentId(firebaseTxId);

    const tx = await withRetry(
      () => this.contract.initiatePayment(
        paymentId,
        recipientAddress,
        usdcAmount,
        firebaseTxId
      ) as Promise<ethers.TransactionResponse>,
      "initiatePayment"
    );

    logger.info("initiatePayment tx submitted", { txHash: tx.hash, firebaseTxId });

    const receipt = await tx.wait(1);

    if (!receipt || receipt.status === 0) {
      throw new AppError(
        `initiatePayment transaction failed: ${tx.hash}`,
        "BLOCKCHAIN_TX_FAILED"
      );
    }

    logger.info("initiatePayment confirmed", {
      txHash: tx.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
    });

    return {
      txHash: tx.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
      paymentId,
    };
  }

  /**
   * Release payment on-chain.
   * Called after all off-chain checks pass.
   */
  async releasePayment(firebaseTxId: string): Promise<OnChainPaymentResult> {
    logger.info("Releasing on-chain payment", { firebaseTxId });

    const paymentId = this.generatePaymentId(firebaseTxId);

    const tx = await withRetry(
      () => this.contract.releasePayment(paymentId) as Promise<ethers.TransactionResponse>,
      "releasePayment"
    );

    logger.info("releasePayment tx submitted", { txHash: tx.hash });

    const receipt = await tx.wait(1);

    if (!receipt || receipt.status === 0) {
      throw new AppError(
        `releasePayment transaction failed: ${tx.hash}`,
        "BLOCKCHAIN_TX_FAILED"
      );
    }

    logger.info("releasePayment confirmed", {
      txHash: tx.hash,
      blockNumber: receipt.blockNumber,
    });

    return {
      txHash: tx.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
      paymentId,
    };
  }

  /**
   * Refund payment on-chain.
   * Called when transaction fails after NGN debit.
   */
  async refundPayment(
    firebaseTxId: string,
    reason: string
  ): Promise<OnChainPaymentResult> {
    logger.info("Refunding on-chain payment", { firebaseTxId, reason });

    const paymentId = this.generatePaymentId(firebaseTxId);

    const tx = await withRetry(
      () => this.contract.refundPayment(paymentId, reason) as Promise<ethers.TransactionResponse>,
      "refundPayment"
    );

    const receipt = await tx.wait(1);

    if (!receipt || receipt.status === 0) {
      throw new AppError(
        `refundPayment transaction failed: ${tx.hash}`,
        "BLOCKCHAIN_TX_FAILED"
      );
    }

    return {
      txHash: tx.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
      paymentId,
    };
  }

  /**
   * Get network info — useful for health checks.
   */
  async getNetworkInfo(): Promise<{ chainId: bigint; blockNumber: number }> {
    const [network, blockNumber] = await Promise.all([
      this.provider.getNetwork(),
      this.provider.getBlockNumber(),
    ]);
    return { chainId: network.chainId, blockNumber };
  }
}

// Lazy singleton — only instantiated when first used
let _blockchainService: BlockchainService | null = null;

export function getBlockchainService(): BlockchainService {
  if (!_blockchainService) {
    _blockchainService = new BlockchainService();
  }
  return _blockchainService;
}
