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
export interface OnChainPaymentResult {
    txHash: string;
    blockNumber: number;
    gasUsed: string;
    paymentId: string;
}
export declare class BlockchainService {
    private provider;
    private signer;
    private escrow;
    private usdc;
    constructor();
    ngnToUsdc(ngnAmount: number, ngnToUsdcRate: number): bigint;
    generatePaymentId(firebaseTxId: string): string;
    getTreasuryBalance(): Promise<bigint>;
    getEscrowBalance(): Promise<bigint>;
    isTransferPending(firebaseTxId: string): Promise<boolean>;
    getNetworkInfo(): Promise<{
        chainId: bigint;
        blockNumber: number;
    }>;
    ensureAllowance(requiredAmount: bigint): Promise<void>;
    initiatePayment(firebaseTxId: string, recipientAddress: string, usdcAmount: bigint): Promise<OnChainPaymentResult>;
    releasePayment(firebaseTxId: string): Promise<OnChainPaymentResult>;
    refundPayment(firebaseTxId: string, _reason: string): Promise<OnChainPaymentResult>;
}
export declare function getBlockchainService(): BlockchainService;
