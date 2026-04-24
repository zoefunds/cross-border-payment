import { expect } from "chai";
import { ethers } from "hardhat";
import { MockUSDC } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

// ─── Constants ────────────────────────────────────────────────────────────────
const DECIMALS = 6;
const ONE_USDC = BigInt(1 * 10 ** DECIMALS);
const HUNDRED_USDC = BigInt(100 * 10 ** DECIMALS);
const MAX_MINT = BigInt(10_000_000) * BigInt(10 ** DECIMALS);

// ─── Test Suite ───────────────────────────────────────────────────────────────
describe("MockUSDC", () => {
  let mockUSDC: MockUSDC;
  let owner: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;

  beforeEach(async () => {
    [owner, alice, bob] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("MockUSDC");
    mockUSDC = (await Factory.deploy(owner.address)) as unknown as MockUSDC;
    await mockUSDC.waitForDeployment();
  });

  // ─── Deployment ─────────────────────────────────────────────────────────
  describe("Deployment", () => {
    it("should set the correct name and symbol", async () => {
      expect(await mockUSDC.name()).to.equal("MockUSDC");
      expect(await mockUSDC.symbol()).to.equal("mUSDC");
    });

    it("should set 6 decimals", async () => {
      expect(await mockUSDC.decimals()).to.equal(6);
    });

    it("should set the deployer as owner", async () => {
      expect(await mockUSDC.owner()).to.equal(owner.address);
    });

    it("should start with zero total supply", async () => {
      expect(await mockUSDC.totalSupply()).to.equal(0n);
    });

    it("should revert if deployed with zero address owner", async () => {
      const Factory = await ethers.getContractFactory("MockUSDC");
      await expect(
        Factory.deploy(ethers.ZeroAddress)
      )
        .to.be.revertedWithCustomError(mockUSDC, "OwnableInvalidOwner")
        .withArgs(ethers.ZeroAddress);
    });
  });

  // ─── Minting ────────────────────────────────────────────────────────────
  describe("Minting", () => {
    it("should mint tokens to a valid address", async () => {
      await mockUSDC.mint(alice.address, HUNDRED_USDC);
      expect(await mockUSDC.balanceOf(alice.address)).to.equal(HUNDRED_USDC);
    });

    it("should emit TokensMinted event with correct args", async () => {
      await expect(mockUSDC.mint(alice.address, HUNDRED_USDC))
        .to.emit(mockUSDC, "TokensMinted")
        .withArgs(alice.address, HUNDRED_USDC, HUNDRED_USDC);
    });

    it("should update totalSupply correctly after multiple mints", async () => {
      await mockUSDC.mint(alice.address, HUNDRED_USDC);
      await mockUSDC.mint(bob.address, ONE_USDC);
      expect(await mockUSDC.totalSupply()).to.equal(HUNDRED_USDC + ONE_USDC);
    });

    it("should revert when non-owner tries to mint", async () => {
      await expect(
        mockUSDC.connect(alice).mint(alice.address, HUNDRED_USDC)
      ).to.be.revertedWithCustomError(mockUSDC, "OwnableUnauthorizedAccount");
    });

    it("should revert when minting to zero address", async () => {
      await expect(
        mockUSDC.mint(ethers.ZeroAddress, HUNDRED_USDC)
      ).to.be.revertedWithCustomError(mockUSDC, "InvalidRecipient");
    });

    it("should revert when minting zero amount", async () => {
      await expect(
        mockUSDC.mint(alice.address, 0n)
      ).to.be.revertedWithCustomError(mockUSDC, "ZeroAmount");
    });

    it("should revert when exceeding MAX_MINT_AMOUNT per call", async () => {
      const overLimit = MAX_MINT + 1n;
      await expect(
        mockUSDC.mint(alice.address, overLimit)
      ).to.be.revertedWithCustomError(mockUSDC, "ExceedsMintLimit");
    });
  });

  // ─── Helpers ────────────────────────────────────────────────────────────
  describe("Helper functions", () => {
    it("toRawAmount should convert correctly", async () => {
      expect(await mockUSDC.toRawAmount(1n)).to.equal(ONE_USDC);
      expect(await mockUSDC.toRawAmount(100n)).to.equal(HUNDRED_USDC);
    });

    it("remainingMintableSupply should decrease after minting", async () => {
      const maxSupply = await mockUSDC.MAX_SUPPLY();
      await mockUSDC.mint(alice.address, HUNDRED_USDC);
      const remaining = await mockUSDC.remainingMintableSupply();
      expect(remaining).to.equal(maxSupply - HUNDRED_USDC);
    });
  });

  // ─── ERC20 Standard ─────────────────────────────────────────────────────
  describe("ERC20 standard behaviour", () => {
    beforeEach(async () => {
      await mockUSDC.mint(alice.address, HUNDRED_USDC);
    });

    it("should transfer tokens between accounts", async () => {
      await mockUSDC.connect(alice).transfer(bob.address, ONE_USDC);
      expect(await mockUSDC.balanceOf(bob.address)).to.equal(ONE_USDC);
      expect(await mockUSDC.balanceOf(alice.address)).to.equal(
        HUNDRED_USDC - ONE_USDC
      );
    });

    it("should handle approve and transferFrom", async () => {
      await mockUSDC.connect(alice).approve(bob.address, ONE_USDC);
      expect(
        await mockUSDC.allowance(alice.address, bob.address)
      ).to.equal(ONE_USDC);

      await mockUSDC
        .connect(bob)
        .transferFrom(alice.address, bob.address, ONE_USDC);

      expect(await mockUSDC.balanceOf(bob.address)).to.equal(ONE_USDC);
    });
  });
});