// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// ─── OpenZeppelin Imports ────────────────────────────────────────────────────
// We use battle-tested, audited implementations.
// Never write your own ERC20 in production.
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockUSDC
 * @author XBorder Payment System
 * @notice A mintable ERC20 token simulating USDC for testnet use.
 *
 * @dev KEY DESIGN DECISIONS:
 *  - 6 decimals: matches real USDC. Critical for consistent math across system.
 *  - ERC20Permit: enables gasless approvals via off-chain signatures (EIP-2612).
 *    This means users won't need two transactions (approve + deposit) in the future.
 *  - Ownable: only the deployer (or transferred owner) can mint.
 *    In production this would be a multi-sig or bridge contract.
 *  - No burn function: not needed for testnet simulation.
 *
 * AMOUNTS: All amounts passed to this contract are in USDC units × 10^6
 *   Example: 100 USDC = 100_000_000 (100 * 10^6)
 */
contract MockUSDC is ERC20, ERC20Permit, Ownable {

    // ─── Constants ───────────────────────────────────────────────────────────

    /// @notice Hard cap on total mintable supply — prevents accidental infinite mint
    /// @dev 1 billion USDC ceiling (1_000_000_000 * 10^6)
    uint256 public constant MAX_SUPPLY = 1_000_000_000 * 10 ** 6;

    /// @notice Maximum amount mintable in a single call — safety guardrail
    /// @dev 10 million USDC per mint (10_000_000 * 10^6)
    uint256 public constant MAX_MINT_AMOUNT = 10_000_000 * 10 ** 6;

    // ─── Events ──────────────────────────────────────────────────────────────

    /**
     * @notice Emitted when new tokens are minted
     * @param to         Recipient address
     * @param amount     Amount minted in raw units (6 decimals)
     * @param newSupply  Total supply after mint
     */
    event TokensMinted(
        address indexed to,
        uint256 amount,
        uint256 newSupply
    );

    // ─── Errors ──────────────────────────────────────────────────────────────
    // Custom errors are cheaper than require() strings — production best practice

    /// @notice Thrown when a mint would exceed MAX_SUPPLY
    error ExceedsMaxSupply(uint256 requested, uint256 available);

    /// @notice Thrown when a single mint exceeds MAX_MINT_AMOUNT
    error ExceedsMintLimit(uint256 requested, uint256 limit);

    /// @notice Thrown when minting to the zero address
    error InvalidRecipient();

    /// @notice Thrown when mint amount is zero
    error ZeroAmount();

    // ─── Constructor ─────────────────────────────────────────────────────────

    /**
     * @param initialOwner The address that will own this contract (deployer)
     *
     * @dev ERC20("MockUSDC", "mUSDC"):
     *   - Name shown in wallets: "MockUSDC"
     *   - Ticker symbol: "mUSDC" (differentiated from real USDC)
     *
     * @dev ERC20Permit("MockUSDC"):
     *   - Domain separator uses this name for EIP-712 typed signatures
     *
     * @dev Ownable(initialOwner):
     *   - Sets the initial owner explicitly (OZ v5 pattern — no hidden msg.sender)
     */
    constructor(address initialOwner)
        ERC20("MockUSDC", "mUSDC")
        ERC20Permit("MockUSDC")
        Ownable(initialOwner)
    {
      
    }

    // ─── External Functions ──────────────────────────────────────────────────

    /**
     * @notice Mint new tokens to a specified address
     * @param to     Recipient address — must not be zero address
     * @param amount Amount to mint in raw units (remember: 6 decimals)
     *
     * @dev Only callable by contract owner.
     *      In this system, the deployer script mints to test wallets.
     *      The relayer service will also be granted minting via ownership transfer
     *      or a separate minter role in a production upgrade.
     *
     * Emits {TokensMinted}
     *
     * Requirements:
     * - `to` cannot be the zero address
     * - `amount` must be greater than zero
     * - `amount` must not exceed MAX_MINT_AMOUNT per call
     * - totalSupply + amount must not exceed MAX_SUPPLY
     */
    function mint(address to, uint256 amount) external onlyOwner {
        // ── Input Validation ─────────────────────────────────────────────────
        if (to == address(0)) revert InvalidRecipient();
        if (amount == 0) revert ZeroAmount();
        if (amount > MAX_MINT_AMOUNT) {
            revert ExceedsMintLimit(amount, MAX_MINT_AMOUNT);
        }

        // ── Supply Cap Check ─────────────────────────────────────────────────
        uint256 currentSupply = totalSupply();
        uint256 available = MAX_SUPPLY - currentSupply;

        if (amount > available) {
            revert ExceedsMaxSupply(amount, available);
        }

        // ── Mint ─────────────────────────────────────────────────────────────
        _mint(to, amount);

        // ── Emit with new supply ─────────────────────────────────────────────
        emit TokensMinted(to, amount, totalSupply());
    }

    // ─── Public View Functions ───────────────────────────────────────────────

    /**
     * @notice Returns 6 decimals — matching real USDC standard
     * @dev Overrides ERC20's default of 18 decimals.
     *      This is CRITICAL — all amount calculations in the system
     *      must assume 6 decimal places.
     */
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /**
     * @notice Returns remaining mintable supply
     * @dev Useful for the relayer and scripts to check before minting
     */
    function remainingMintableSupply() external view returns (uint256) {
        return MAX_SUPPLY - totalSupply();
    }

    /**
     * @notice Helper to convert human-readable USDC to raw units
     * @dev Example: toRawAmount(100) returns 100_000_000
     *      Use this in scripts and tests — never hardcode raw amounts
     * @param usdcAmount Amount in whole USDC (e.g., 100 for $100)
     */
    function toRawAmount(uint256 usdcAmount) external pure returns (uint256) {
        return usdcAmount * 10 ** 6;
    }
}