/**
 * Blockchain Service — Base Sepolia
 *
 * Escrow:   0xaC11528c36A05C904Bead5Ed3a74d4e40Dd38bfE
 * MockUSDC: 0xB9a0E369995c03d966470D4E86b1bdbAD9bd7dc2
 *
 * Function mapping (old phantom name → real contract name):
 *   initiatePayment → deposit
 *   releasePayment  → completeTransfer
 *   refundPayment   → cancelTransfer
 */

import { ethers } from "ethers";
import { createContextLogger } from "../utils/logger";
import { AppError } from "../utils/errors";
import { env } from "../config/env";
import { CROSS_BORDER_PAYMENT_ABI, USDC_ABI } from "./CrossBorderPayment.abi";

const logger = createContextLogger({ service: "BlockchainService" });

const USDC_DECIMALS = 6;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

export interface OnChainPaymentResult {
  txHash:      string;
  blockNumber: number;
  gasUsed:     string;
  paymentId:   string;
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
  private signer:   ethers.Wallet;
  private escrow:   ethers.Contract;
  private usdc:     ethers.Contract;

  constructor() {
    if (!env.BASE_RPC_URL)             throw new AppError("BASE_RPC_URL is required",             "CONFIG_ERROR");
    if (!env.TREASURY_PRIVATE_KEY)     throw new AppError("TREASURY_PRIVATE_KEY is required",     "CONFIG_ERROR");
    if (!env.PAYMENT_CONTRACT_ADDRESS) throw new AppError("PAYMENT_CONTRACT_ADDRESS is required", "CONFIG_ERROR");
    if (!env.USDC_CONTRACT_ADDRESS)    throw new AppError("USDC_CONTRACT_ADDRESS is required",    "CONFIG_ERROR");

    this.provider = new ethers.JsonRpcProvider(env.BASE_RPC_URL);
    this.signer   = new ethers.Wallet(env.TREASURY_PRIVATE_KEY, this.provider);

    this.escrow = new ethers.Contract(
      env.PAYMENT_CONTRACT_ADDRESS,
      CROSS_BORDER_PAYMENT_ABI,
      this.signer
    );

    this.usdc = new ethers.Contract(
      env.USDC_CONTRACT_ADDRESS,
      USDC_ABI,
      this.signer
    );

    logger.info("BlockchainService initialized", {
      escrowAddress:  env.PAYMENT_CONTRACT_ADDRESS,
      usdcAddress:    env.USDC_CONTRACT_ADDRESS,
      signerAddress:  this.signer.address,
      network:        "Base Sepolia (84532)",
    });
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  ngnToUsdc(ngnAmount: number, ngnToUsdcRate: number): bigint {
    const usdcAmount = ngnAmount * ngnToUsdcRate;
    return BigInt(Math.floor(usdcAmount * 10 ** USDC_DECIMALS));
  }

  generatePaymentId(firebaseTxId: string): string {
    return ethers.keccak256(ethers.toUtf8Bytes(firebaseTxId));
  }

  // ── Read ─────────────────────────────────────────────────────────────────

  async getTreasuryBalance(): Promise<bigint> {
    return await this.usdc.balanceOf(this.signer.address) as bigint;
  }

  async getEscrowBalance(): Promise<bigint> {
    return await this.escrow.contractBalance() as bigint;
  }

  async isTransferPending(firebaseTxId: string): Promise<boolean> {
    const txId = this.generatePaymentId(firebaseTxId);
    return await this.escrow.isPending(txId) as boolean;
  }

  async getNetworkInfo(): Promise<{ chainId: bigint; blockNumber: number }> {
    const [network, blockNumber] = await Promise.all([
      this.provider.getNetwork(),
      this.provider.getBlockNumber(),
    ]);
    return { chainId: network.chainId, blockNumber };
  }

  // ── USDC Allowance ────────────────────────────────────────────────────────

  async ensureAllowance(requiredAmount: bigint): Promise<void> {
    const allowance = await this.usdc.allowance(
      this.signer.address,
      env.PAYMENT_CONTRACT_ADDRESS
    ) as bigint;

    if (allowance < requiredAmount) {
      logger.info("Approving USDC for Escrow", {
        required: requiredAmount.toString(),
        current:  allowance.toString(),
      });
      const tx = await withRetry(
        () => this.usdc.approve(
          env.PAYMENT_CONTRACT_ADDRESS,
          ethers.MaxUint256
        ) as Promise<ethers.TransactionResponse>,
        "USDC approve"
      );
      await tx.wait(1);
      logger.info("USDC approval confirmed", { txHash: tx.hash });
    }
  }

  // ── Write ─────────────────────────────────────────────────────────────────

  async initiatePayment(
    firebaseTxId:     string,
    recipientAddress: string,
    usdcAmount:       bigint
  ): Promise<OnChainPaymentResult> {
    logger.info("Depositing USDC into Escrow", {
      firebaseTxId,
      recipientAddress,
      usdcAmount: usdcAmount.toString(),
    });

    const balance = await this.getTreasuryBalance();
    if (balance < usdcAmount) {
      throw new AppError(
        `Insufficient USDC. Has ${balance}, needs ${usdcAmount}`,
        "INSUFFICIENT_USDC_BALANCE",
        422
      );
    }

    await this.ensureAllowance(usdcAmount);

    const txId = this.generatePaymentId(firebaseTxId);

    const tx = await withRetry(
      () => this.escrow.deposit(
        txId,
        recipientAddress,
        usdcAmount
      ) as Promise<ethers.TransactionResponse>,
      "escrow.deposit"
    );

    logger.info("deposit() submitted", { txHash: tx.hash });
    const receipt = await tx.wait(1);

    if (!receipt || receipt.status === 0) {
      throw new AppError(`deposit() failed: ${tx.hash}`, "BLOCKCHAIN_TX_FAILED");
    }

    logger.info("deposit() confirmed", {
      txHash:      tx.hash,
      blockNumber: receipt.blockNumber,
    });

    return {
      txHash:      tx.hash,
      blockNumber: receipt.blockNumber,
      gasUsed:     receipt.gasUsed.toString(),
      paymentId:   txId,
    };
  }

  async releasePayment(firebaseTxId: string): Promise<OnChainPaymentResult> {
    logger.info("completeTransfer() on-chain", { firebaseTxId });

    const txId = this.generatePaymentId(firebaseTxId);

    const tx = await withRetry(
      () => this.escrow.completeTransfer(txId) as Promise<ethers.TransactionResponse>,
      "escrow.completeTransfer"
    );

    const receipt = await tx.wait(1);
    if (!receipt || receipt.status === 0) {
      throw new AppError(`completeTransfer() failed: ${tx.hash}`, "BLOCKCHAIN_TX_FAILED");
    }

    logger.info("completeTransfer() confirmed", { txHash: tx.hash });

    return {
      txHash:      tx.hash,
      blockNumber: receipt.blockNumber,
      gasUsed:     receipt.gasUsed.toString(),
      paymentId:   txId,
    };
  }

  async refundPayment(
    firebaseTxId: string,
    _reason: string
  ): Promise<OnChainPaymentResult> {
    logger.info("cancelTransfer() on-chain", { firebaseTxId });

    const txId = this.generatePaymentId(firebaseTxId);

    const tx = await withRetry(
      () => this.escrow.cancelTransfer(txId) as Promise<ethers.TransactionResponse>,
      "escrow.cancelTransfer"
    );

    const receipt = await tx.wait(1);
    if (!receipt || receipt.status === 0) {
      throw new AppError(`cancelTransfer() failed: ${tx.hash}`, "BLOCKCHAIN_TX_FAILED");
    }

    return {
      txHash:      tx.hash,
      blockNumber: receipt.blockNumber,
      gasUsed:     receipt.gasUsed.toString(),
      paymentId:   txId,
    };
  }
}

let _instance: BlockchainService | null = null;

export function getBlockchainService(): BlockchainService {
  if (!_instance) _instance = new BlockchainService();
  return _instance;
}
