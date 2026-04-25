"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.BlockchainService = void 0;
exports.getBlockchainService = getBlockchainService;
const ethers_1 = require("ethers");
const logger_1 = require("../utils/logger");
const errors_1 = require("../utils/errors");
const env_1 = require("../config/env");
const CrossBorderPayment_abi_1 = require("./CrossBorderPayment.abi");
const logger = (0, logger_1.createContextLogger)({ service: "BlockchainService" });
const USDC_DECIMALS = 6;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;
async function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
async function withRetry(fn, label, retries = MAX_RETRIES) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            return await fn();
        }
        catch (error) {
            const isLast = attempt === retries;
            logger.warn(`${label} failed (attempt ${attempt}/${retries})`, {
                error: error instanceof Error ? error.message : String(error),
                isLast,
            });
            if (isLast)
                throw error;
            await sleep(RETRY_DELAY_MS * attempt);
        }
    }
    throw new Error(`${label} failed after ${retries} attempts`);
}
class BlockchainService {
    constructor() {
        if (!env_1.env.BASE_RPC_URL)
            throw new errors_1.AppError("BASE_RPC_URL is required", "CONFIG_ERROR");
        if (!env_1.env.TREASURY_PRIVATE_KEY)
            throw new errors_1.AppError("TREASURY_PRIVATE_KEY is required", "CONFIG_ERROR");
        if (!env_1.env.PAYMENT_CONTRACT_ADDRESS)
            throw new errors_1.AppError("PAYMENT_CONTRACT_ADDRESS is required", "CONFIG_ERROR");
        if (!env_1.env.USDC_CONTRACT_ADDRESS)
            throw new errors_1.AppError("USDC_CONTRACT_ADDRESS is required", "CONFIG_ERROR");
        this.provider = new ethers_1.ethers.JsonRpcProvider(env_1.env.BASE_RPC_URL);
        this.signer = new ethers_1.ethers.Wallet(env_1.env.TREASURY_PRIVATE_KEY, this.provider);
        this.escrow = new ethers_1.ethers.Contract(env_1.env.PAYMENT_CONTRACT_ADDRESS, CrossBorderPayment_abi_1.CROSS_BORDER_PAYMENT_ABI, this.signer);
        this.usdc = new ethers_1.ethers.Contract(env_1.env.USDC_CONTRACT_ADDRESS, CrossBorderPayment_abi_1.USDC_ABI, this.signer);
        logger.info("BlockchainService initialized", {
            escrowAddress: env_1.env.PAYMENT_CONTRACT_ADDRESS,
            usdcAddress: env_1.env.USDC_CONTRACT_ADDRESS,
            signerAddress: this.signer.address,
            network: "Base Sepolia (84532)",
        });
    }
    // ── Helpers ──────────────────────────────────────────────────────────────
    ngnToUsdc(ngnAmount, ngnToUsdcRate) {
        const usdcAmount = ngnAmount * ngnToUsdcRate;
        return BigInt(Math.floor(usdcAmount * 10 ** USDC_DECIMALS));
    }
    generatePaymentId(firebaseTxId) {
        return ethers_1.ethers.keccak256(ethers_1.ethers.toUtf8Bytes(firebaseTxId));
    }
    // ── Read ─────────────────────────────────────────────────────────────────
    async getTreasuryBalance() {
        return await this.usdc.balanceOf(this.signer.address);
    }
    async getEscrowBalance() {
        return await this.escrow.contractBalance();
    }
    async isTransferPending(firebaseTxId) {
        const txId = this.generatePaymentId(firebaseTxId);
        return await this.escrow.isPending(txId);
    }
    async getNetworkInfo() {
        const [network, blockNumber] = await Promise.all([
            this.provider.getNetwork(),
            this.provider.getBlockNumber(),
        ]);
        return { chainId: network.chainId, blockNumber };
    }
    // ── USDC Allowance ────────────────────────────────────────────────────────
    async ensureAllowance(requiredAmount) {
        const allowance = await this.usdc.allowance(this.signer.address, env_1.env.PAYMENT_CONTRACT_ADDRESS);
        if (allowance < requiredAmount) {
            logger.info("Approving USDC for Escrow", {
                required: requiredAmount.toString(),
                current: allowance.toString(),
            });
            const tx = await withRetry(() => this.usdc.approve(env_1.env.PAYMENT_CONTRACT_ADDRESS, ethers_1.ethers.MaxUint256), "USDC approve");
            await tx.wait(1);
            logger.info("USDC approval confirmed", { txHash: tx.hash });
        }
    }
    // ── Write ─────────────────────────────────────────────────────────────────
    async initiatePayment(firebaseTxId, recipientAddress, usdcAmount) {
        logger.info("Depositing USDC into Escrow", {
            firebaseTxId,
            recipientAddress,
            usdcAmount: usdcAmount.toString(),
        });
        const balance = await this.getTreasuryBalance();
        if (balance < usdcAmount) {
            throw new errors_1.AppError(`Insufficient USDC. Has ${balance}, needs ${usdcAmount}`, "INSUFFICIENT_USDC_BALANCE", 422);
        }
        await this.ensureAllowance(usdcAmount);
        const txId = this.generatePaymentId(firebaseTxId);
        const tx = await withRetry(() => this.escrow.deposit(txId, recipientAddress, usdcAmount), "escrow.deposit");
        logger.info("deposit() submitted", { txHash: tx.hash });
        const receipt = await tx.wait(1);
        if (!receipt || receipt.status === 0) {
            throw new errors_1.AppError(`deposit() failed: ${tx.hash}`, "BLOCKCHAIN_TX_FAILED");
        }
        logger.info("deposit() confirmed", {
            txHash: tx.hash,
            blockNumber: receipt.blockNumber,
        });
        return {
            txHash: tx.hash,
            blockNumber: receipt.blockNumber,
            gasUsed: receipt.gasUsed.toString(),
            paymentId: txId,
        };
    }
    async releasePayment(firebaseTxId) {
        logger.info("completeTransfer() on-chain", { firebaseTxId });
        const txId = this.generatePaymentId(firebaseTxId);
        const tx = await withRetry(() => this.escrow.completeTransfer(txId), "escrow.completeTransfer");
        const receipt = await tx.wait(1);
        if (!receipt || receipt.status === 0) {
            throw new errors_1.AppError(`completeTransfer() failed: ${tx.hash}`, "BLOCKCHAIN_TX_FAILED");
        }
        logger.info("completeTransfer() confirmed", { txHash: tx.hash });
        return {
            txHash: tx.hash,
            blockNumber: receipt.blockNumber,
            gasUsed: receipt.gasUsed.toString(),
            paymentId: txId,
        };
    }
    async refundPayment(firebaseTxId, _reason) {
        logger.info("cancelTransfer() on-chain", { firebaseTxId });
        const txId = this.generatePaymentId(firebaseTxId);
        const tx = await withRetry(() => this.escrow.cancelTransfer(txId), "escrow.cancelTransfer");
        const receipt = await tx.wait(1);
        if (!receipt || receipt.status === 0) {
            throw new errors_1.AppError(`cancelTransfer() failed: ${tx.hash}`, "BLOCKCHAIN_TX_FAILED");
        }
        return {
            txHash: tx.hash,
            blockNumber: receipt.blockNumber,
            gasUsed: receipt.gasUsed.toString(),
            paymentId: txId,
        };
    }
}
exports.BlockchainService = BlockchainService;
let _instance = null;
function getBlockchainService() {
    if (!_instance)
        _instance = new BlockchainService();
    return _instance;
}
//# sourceMappingURL=blockchain.service.js.map