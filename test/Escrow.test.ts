import { expect } from "chai";
import { ethers } from "hardhat";
import { MockUSDC, Escrow } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

// ─── Constants ────────────────────────────────────────────────────────────────
const DECIMALS      = 6;
const HUNDRED_USDC  = BigInt(100   * 10 ** DECIMALS);
const THOUSAND_USDC = BigInt(1_000 * 10 ** DECIMALS);
const FEE_BPS       = 50n;
const BPS_DENOM     = 10_000n;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeTxId(label: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(label));
}

function calcFee(amount: bigint): { fee: bigint; net: bigint } {
  const fee = (amount * FEE_BPS) / BPS_DENOM;
  return { fee, net: amount - fee };
}

// ─── Test Suite ───────────────────────────────────────────────────────────────
describe("Escrow", () => {
  let mockUSDC : MockUSDC;
  let escrow   : Escrow;

  let owner     : HardhatEthersSigner;
  let relayer   : HardhatEthersSigner;
  let sender    : HardhatEthersSigner;
  let recipient : HardhatEthersSigner;
  let feeWallet : HardhatEthersSigner;
  let stranger  : HardhatEthersSigner;

  beforeEach(async () => {
    [owner, relayer, sender, recipient, feeWallet, stranger] =
      await ethers.getSigners();

    // ── Deploy MockUSDC ──────────────────────────────────────────────────────
    const USDCFactory = await ethers.getContractFactory("MockUSDC");
    mockUSDC = (await USDCFactory.deploy(owner.address)) as unknown as MockUSDC;
    await mockUSDC.waitForDeployment();

    // ── Deploy Escrow ────────────────────────────────────────────────────────
    const EscrowFactory = await ethers.getContractFactory("Escrow");
    escrow = (await EscrowFactory.deploy(
      await mockUSDC.getAddress(),
      relayer.address,
      feeWallet.address,
      FEE_BPS,
      owner.address
    )) as unknown as Escrow;
    await escrow.waitForDeployment();

    // ── Fund sender with 1000 USDC ───────────────────────────────────────────
    await mockUSDC.connect(owner).mint(sender.address, THOUSAND_USDC);

    // ── Sender approves escrow ───────────────────────────────────────────────
    await mockUSDC
      .connect(sender)
      .approve(await escrow.getAddress(), THOUSAND_USDC);
  });

  // ─── Deployment ─────────────────────────────────────────────────────────
  describe("Deployment", () => {
    it("should set correct initial state", async () => {
      expect(await escrow.relayer()).to.equal(relayer.address);
      expect(await escrow.feeRecipient()).to.equal(feeWallet.address);
      expect(await escrow.feeBasisPoints()).to.equal(FEE_BPS);
      expect(await escrow.owner()).to.equal(owner.address);
      expect(await escrow.accumulatedFees()).to.equal(0n);
    });

    it("should revert if deployed with zero address token", async () => {
      const Factory = await ethers.getContractFactory("Escrow");
      await expect(
        Factory.deploy(
          ethers.ZeroAddress,
          relayer.address,
          feeWallet.address,
          FEE_BPS,
          owner.address
        )
      ).to.be.revertedWithCustomError(escrow, "ZeroAddress");
    });

    it("should revert if fee exceeds MAX_FEE_BASIS_POINTS", async () => {
      const Factory = await ethers.getContractFactory("Escrow");
      await expect(
        Factory.deploy(
          await mockUSDC.getAddress(),
          relayer.address,
          feeWallet.address,
          501n,
          owner.address
        )
      ).to.be.revertedWithCustomError(escrow, "FeeTooHigh");
    });
  });

  // ─── Deposit ────────────────────────────────────────────────────────────
  describe("deposit()", () => {
    it("should lock USDC and store transfer record", async () => {
      const txId = makeTxId("transfer-001");
      const { fee, net } = calcFee(HUNDRED_USDC);

      await escrow.connect(sender).deposit(txId, recipient.address, HUNDRED_USDC);

      const transfer = await escrow.getTransfer(txId);
      expect(transfer.sender).to.equal(sender.address);
      expect(transfer.recipient).to.equal(recipient.address);
      expect(transfer.amount).to.equal(HUNDRED_USDC);
      expect(transfer.fee).to.equal(fee);
      expect(transfer.netAmount).to.equal(net);
      expect(transfer.status).to.equal(0n);
    });

    it("should emit TransferInitiated with correct args", async () => {
      const txId = makeTxId("transfer-002");
      const { fee, net } = calcFee(HUNDRED_USDC);
      const blockTs = BigInt(
        (await ethers.provider.getBlock("latest"))!.timestamp + 1
      );

      await expect(
        escrow.connect(sender).deposit(txId, recipient.address, HUNDRED_USDC)
      )
        .to.emit(escrow, "TransferInitiated")
        .withArgs(
          txId,
          sender.address,
          recipient.address,
          HUNDRED_USDC,
          fee,
          net,
          blockTs
        );
    });

    it("should transfer USDC from sender to escrow", async () => {
      const txId = makeTxId("transfer-003");
      const escrowAddr = await escrow.getAddress();

      const before = await mockUSDC.balanceOf(escrowAddr);
      await escrow.connect(sender).deposit(txId, recipient.address, HUNDRED_USDC);
      const after = await mockUSDC.balanceOf(escrowAddr);

      expect(after - before).to.equal(HUNDRED_USDC);
    });

    it("should accumulate fees correctly", async () => {
      const txId = makeTxId("transfer-004");
      const { fee } = calcFee(HUNDRED_USDC);

      await escrow.connect(sender).deposit(txId, recipient.address, HUNDRED_USDC);
      expect(await escrow.accumulatedFees()).to.equal(fee);
    });

    it("should revert on duplicate txId", async () => {
      const txId = makeTxId("transfer-005");
      await escrow.connect(sender).deposit(txId, recipient.address, HUNDRED_USDC);

      await mockUSDC.connect(owner).mint(sender.address, HUNDRED_USDC);
      await mockUSDC
        .connect(sender)
        .approve(await escrow.getAddress(), HUNDRED_USDC);

      await expect(
        escrow.connect(sender).deposit(txId, recipient.address, HUNDRED_USDC)
      ).to.be.revertedWithCustomError(escrow, "TxIdAlreadyUsed");
    });

    it("should revert below minimum deposit", async () => {
      const txId = makeTxId("transfer-006");
      const belowMin = BigInt(0.5 * 10 ** DECIMALS);

      await expect(
        escrow.connect(sender).deposit(txId, recipient.address, belowMin)
      ).to.be.revertedWithCustomError(escrow, "AmountBelowMinimum");
    });

    it("should revert when paused", async () => {
      await escrow.connect(owner).pause();
      const txId = makeTxId("transfer-007");

      await expect(
        escrow.connect(sender).deposit(txId, recipient.address, HUNDRED_USDC)
      ).to.be.revertedWithCustomError(escrow, "EnforcedPause");
    });
  });

  // ─── Complete Transfer ───────────────────────────────────────────────────
  describe("completeTransfer()", () => {
    let txId: string;

    beforeEach(async () => {
      txId = makeTxId("complete-001");
      await escrow.connect(sender).deposit(txId, recipient.address, HUNDRED_USDC);
    });

    it("should release net amount to recipient", async () => {
      const { net } = calcFee(HUNDRED_USDC);
      const before = await mockUSDC.balanceOf(recipient.address);

      await escrow.connect(relayer).completeTransfer(txId);

      const after = await mockUSDC.balanceOf(recipient.address);
      expect(after - before).to.equal(net);
    });

    it("should emit TransferCompleted", async () => {
      const { net } = calcFee(HUNDRED_USDC);
      const blockTs = BigInt(
        (await ethers.provider.getBlock("latest"))!.timestamp + 1
      );

      await expect(escrow.connect(relayer).completeTransfer(txId))
        .to.emit(escrow, "TransferCompleted")
        .withArgs(txId, recipient.address, net, blockTs);
    });

    it("should update transfer status to COMPLETED", async () => {
      await escrow.connect(relayer).completeTransfer(txId);
      const transfer = await escrow.getTransfer(txId);
      expect(transfer.status).to.equal(1n);
    });

    it("should revert if caller is not relayer", async () => {
      await expect(
        escrow.connect(stranger).completeTransfer(txId)
      ).to.be.revertedWithCustomError(escrow, "NotRelayer");
    });

    it("should revert if transfer already completed", async () => {
      await escrow.connect(relayer).completeTransfer(txId);
      await expect(
        escrow.connect(relayer).completeTransfer(txId)
      ).to.be.revertedWithCustomError(escrow, "TransferNotPending");
    });
  });

  // ─── Cancel Transfer ─────────────────────────────────────────────────────
  describe("cancelTransfer()", () => {
    let txId: string;

    beforeEach(async () => {
      txId = makeTxId("cancel-001");
      await escrow.connect(sender).deposit(txId, recipient.address, HUNDRED_USDC);
    });

    it("should refund full gross amount to sender", async () => {
      const before = await mockUSDC.balanceOf(sender.address);
      await escrow.connect(relayer).cancelTransfer(txId);
      const after = await mockUSDC.balanceOf(sender.address);
      expect(after - before).to.equal(HUNDRED_USDC);
    });

    it("should reverse fee from accumulatedFees", async () => {
      await escrow.connect(relayer).cancelTransfer(txId);
      expect(await escrow.accumulatedFees()).to.equal(0n);
    });

    it("should emit TransferCancelled", async () => {
      const blockTs = BigInt(
        (await ethers.provider.getBlock("latest"))!.timestamp + 1
      );

      await expect(escrow.connect(relayer).cancelTransfer(txId))
        .to.emit(escrow, "TransferCancelled")
        .withArgs(txId, sender.address, HUNDRED_USDC, blockTs);
    });

    it("should update status to CANCELLED", async () => {
      await escrow.connect(relayer).cancelTransfer(txId);
      const transfer = await escrow.getTransfer(txId);
      expect(transfer.status).to.equal(2n);
    });
  });

  // ─── Fee Management ──────────────────────────────────────────────────────
  describe("withdrawFees()", () => {
    it("should send accumulated fees to feeRecipient", async () => {
      const txId = makeTxId("fee-001");
      const { fee } = calcFee(HUNDRED_USDC);

      await escrow.connect(sender).deposit(txId, recipient.address, HUNDRED_USDC);
      await escrow.connect(relayer).completeTransfer(txId);

      const before = await mockUSDC.balanceOf(feeWallet.address);
      await escrow.connect(owner).withdrawFees();
      const after = await mockUSDC.balanceOf(feeWallet.address);

      expect(after - before).to.equal(fee);
      expect(await escrow.accumulatedFees()).to.equal(0n);
    });

    it("should revert if no fees to withdraw", async () => {
      await expect(
        escrow.connect(owner).withdrawFees()
      ).to.be.revertedWithCustomError(escrow, "NoFeesToWithdraw");
    });
  });

  // ─── Admin Controls ──────────────────────────────────────────────────────
  describe("Admin controls", () => {
    it("should update relayer address", async () => {
      await escrow.connect(owner).updateRelayer(stranger.address);
      expect(await escrow.relayer()).to.equal(stranger.address);
    });

    it("should update fee basis points", async () => {
      await escrow.connect(owner).updateFee(100n);
      expect(await escrow.feeBasisPoints()).to.equal(100n);
    });

    it("should revert if fee update exceeds cap", async () => {
      await expect(
        escrow.connect(owner).updateFee(501n)
      ).to.be.revertedWithCustomError(escrow, "FeeTooHigh");
    });

    it("should revert admin calls from non-owner", async () => {
      await expect(
        escrow.connect(stranger).updateRelayer(stranger.address)
      ).to.be.revertedWithCustomError(escrow, "OwnableUnauthorizedAccount");
    });
  });

  // ─── View Helpers ────────────────────────────────────────────────────────
  describe("View functions", () => {
    it("calculateFee should return correct values", async () => {
      const { fee, net } = calcFee(HUNDRED_USDC);
      const [contractFee, contractNet] = await escrow.calculateFee(HUNDRED_USDC);
      expect(contractFee).to.equal(fee);
      expect(contractNet).to.equal(net);
    });

    it("isPending should return true for pending transfer", async () => {
      const txId = makeTxId("view-001");
      await escrow.connect(sender).deposit(txId, recipient.address, HUNDRED_USDC);
      expect(await escrow.isPending(txId)).to.equal(true);
    });

    it("contractBalance should reflect locked funds", async () => {
      const txId = makeTxId("view-002");
      await escrow.connect(sender).deposit(txId, recipient.address, HUNDRED_USDC);
      expect(await escrow.contractBalance()).to.equal(HUNDRED_USDC);
    });
  });
});