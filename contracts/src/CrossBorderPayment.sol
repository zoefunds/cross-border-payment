// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title CrossBorderPayment
 * @notice Handles USDC settlement for Nigeria <-> Ghana cross-border payments.
 *
 * Payment Flow:
 *   1. Backend calls initiatePayment() with a unique paymentId
 *   2. USDC is transferred from treasury to contract
 *   3. Backend calls releasePayment() to send USDC to recipient
 *   4. Events are emitted at each step for backend to track
 *
 * Security:
 *   - ReentrancyGuard on all state-changing functions
 *   - Pausable for emergency stops
 *   - Owner-only admin functions
 *   - Payment expiry to prevent stuck funds
 */
contract CrossBorderPayment is ReentrancyGuard, Pausable, Ownable {
    using SafeERC20 for IERC20;

    // ── State Variables ────────────────────────────────────────────────

    IERC20 public immutable usdc;

    // Payment expiry window: 24 hours
    uint256 public constant PAYMENT_EXPIRY = 24 hours;

    // Platform fee in basis points (150 = 1.5%)
    uint256 public feeBasisPoints = 150;

    // Treasury address that holds USDC
    address public treasury;

    // Fee collector address
    address public feeCollector;

    enum PaymentStatus {
        NONE,       // Does not exist
        INITIATED,  // Payment created, USDC locked
        RELEASED,   // USDC sent to recipient
        REFUNDED,   // USDC returned to treasury
        EXPIRED     // Payment expired
    }

    struct Payment {
        bytes32 paymentId;      // Unique ID matching Firebase transaction ID
        address sender;         // Treasury/backend address
        address recipient;      // Final USDC recipient
        uint256 amount;         // USDC amount (6 decimals)
        uint256 fee;            // Platform fee in USDC
        uint256 createdAt;      // Block timestamp
        uint256 expiresAt;      // Expiry timestamp
        PaymentStatus status;
        string firebaseTxId;    // Links back to Firestore transaction
    }

    // paymentId => Payment
    mapping(bytes32 => Payment) public payments;

    // Total USDC locked in contract
    uint256 public totalLocked;

    // ── Events ─────────────────────────────────────────────────────────

    event PaymentInitiated(
        bytes32 indexed paymentId,
        address indexed sender,
        address indexed recipient,
        uint256 amount,
        uint256 fee,
        string firebaseTxId,
        uint256 expiresAt
    );

    event PaymentReleased(
        bytes32 indexed paymentId,
        address indexed recipient,
        uint256 amount,
        uint256 fee,
        string firebaseTxId
    );

    event PaymentRefunded(
        bytes32 indexed paymentId,
        address indexed treasury,
        uint256 amount,
        string reason
    );

    event PaymentExpired(
        bytes32 indexed paymentId,
        uint256 amount
    );

    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event FeeUpdated(uint256 oldFee, uint256 newFee);
    event FeeCollectorUpdated(address indexed oldCollector, address indexed newCollector);

    // ── Errors ─────────────────────────────────────────────────────────

    error PaymentAlreadyExists(bytes32 paymentId);
    error PaymentNotFound(bytes32 paymentId);
    error PaymentNotInitiated(bytes32 paymentId, PaymentStatus status);
    error PaymentExpiredError(bytes32 paymentId);
    error PaymentNotExpired(bytes32 paymentId);
    error InvalidAmount();
    error InvalidAddress();
    error InvalidFee();
    error InsufficientContractBalance();

    // ── Constructor ────────────────────────────────────────────────────

    constructor(
        address _usdc,
        address _treasury,
        address _feeCollector
    ) Ownable(msg.sender) {
        if (_usdc == address(0)) revert InvalidAddress();
        if (_treasury == address(0)) revert InvalidAddress();
        if (_feeCollector == address(0)) revert InvalidAddress();

        usdc = IERC20(_usdc);
        treasury = _treasury;
        feeCollector = _feeCollector;
    }

    // ── Core Functions ─────────────────────────────────────────────────

    /**
     * @notice Initiate a payment. Called by backend after NGN is debited.
     * @param paymentId Unique payment identifier (keccak256 of Firebase TX ID)
     * @param recipient Address to receive USDC
     * @param amount USDC amount in 6-decimal units
     * @param firebaseTxId Firebase transaction document ID for audit trail
     */
    function initiatePayment(
        bytes32 paymentId,
        address recipient,
        uint256 amount,
        string calldata firebaseTxId
    ) external onlyOwner whenNotPaused nonReentrant {
        if (amount == 0) revert InvalidAmount();
        if (recipient == address(0)) revert InvalidAddress();
        if (payments[paymentId].status != PaymentStatus.NONE) {
            revert PaymentAlreadyExists(paymentId);
        }

        uint256 fee = (amount * feeBasisPoints) / 10_000;
        uint256 totalRequired = amount + fee;
        uint256 expiresAt = block.timestamp + PAYMENT_EXPIRY;

        // Pull USDC from treasury into contract
        usdc.safeTransferFrom(treasury, address(this), totalRequired);

        payments[paymentId] = Payment({
            paymentId: paymentId,
            sender: treasury,
            recipient: recipient,
            amount: amount,
            fee: fee,
            createdAt: block.timestamp,
            expiresAt: expiresAt,
            status: PaymentStatus.INITIATED,
            firebaseTxId: firebaseTxId
        });

        totalLocked += totalRequired;

        emit PaymentInitiated(
            paymentId,
            treasury,
            recipient,
            amount,
            fee,
            firebaseTxId,
            expiresAt
        );
    }

    /**
     * @notice Release USDC to recipient. Called by backend after all checks pass.
     * @param paymentId Payment to release
     */
    function releasePayment(
        bytes32 paymentId
    ) external onlyOwner whenNotPaused nonReentrant {
        Payment storage payment = payments[paymentId];

        if (payment.status == PaymentStatus.NONE) revert PaymentNotFound(paymentId);
        if (payment.status != PaymentStatus.INITIATED) {
            revert PaymentNotInitiated(paymentId, payment.status);
        }
        if (block.timestamp > payment.expiresAt) revert PaymentExpiredError(paymentId);

        payment.status = PaymentStatus.RELEASED;
        totalLocked -= (payment.amount + payment.fee);

        // Send USDC to recipient
        usdc.safeTransfer(payment.recipient, payment.amount);

        // Send fee to fee collector
        if (payment.fee > 0) {
            usdc.safeTransfer(feeCollector, payment.fee);
        }

        emit PaymentReleased(
            paymentId,
            payment.recipient,
            payment.amount,
            payment.fee,
            payment.firebaseTxId
        );
    }

    /**
     * @notice Refund USDC back to treasury. Called on payment failure.
     * @param paymentId Payment to refund
     * @param reason Human-readable refund reason for audit trail
     */
    function refundPayment(
        bytes32 paymentId,
        string calldata reason
    ) external onlyOwner nonReentrant {
        Payment storage payment = payments[paymentId];

        if (payment.status == PaymentStatus.NONE) revert PaymentNotFound(paymentId);
        if (payment.status != PaymentStatus.INITIATED) {
            revert PaymentNotInitiated(paymentId, payment.status);
        }

        uint256 refundAmount = payment.amount + payment.fee;
        payment.status = PaymentStatus.REFUNDED;
        totalLocked -= refundAmount;

        usdc.safeTransfer(treasury, refundAmount);

        emit PaymentRefunded(paymentId, treasury, refundAmount, reason);
    }

    /**
     * @notice Expire a payment that has passed its expiry time.
     * Anyone can call this to clean up expired payments.
     * @param paymentId Payment to expire
     */
    function expirePayment(bytes32 paymentId) external nonReentrant {
        Payment storage payment = payments[paymentId];

        if (payment.status == PaymentStatus.NONE) revert PaymentNotFound(paymentId);
        if (payment.status != PaymentStatus.INITIATED) {
            revert PaymentNotInitiated(paymentId, payment.status);
        }
        if (block.timestamp <= payment.expiresAt) revert PaymentNotExpired(paymentId);

        uint256 refundAmount = payment.amount + payment.fee;
        payment.status = PaymentStatus.EXPIRED;
        totalLocked -= refundAmount;

        usdc.safeTransfer(treasury, refundAmount);

        emit PaymentExpired(paymentId, refundAmount);
    }

    // ── View Functions ─────────────────────────────────────────────────

    function getPayment(bytes32 paymentId) external view returns (Payment memory) {
        return payments[paymentId];
    }

    function getContractBalance() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }

    function isPaymentExpired(bytes32 paymentId) external view returns (bool) {
        Payment memory payment = payments[paymentId];
        return payment.status == PaymentStatus.INITIATED &&
               block.timestamp > payment.expiresAt;
    }

    // ── Admin Functions ────────────────────────────────────────────────

    function setTreasury(address _treasury) external onlyOwner {
        if (_treasury == address(0)) revert InvalidAddress();
        emit TreasuryUpdated(treasury, _treasury);
        treasury = _treasury;
    }

    function setFeeBasisPoints(uint256 _feeBasisPoints) external onlyOwner {
        if (_feeBasisPoints > 1000) revert InvalidFee(); // Max 10%
        emit FeeUpdated(feeBasisPoints, _feeBasisPoints);
        feeBasisPoints = _feeBasisPoints;
    }

    function setFeeCollector(address _feeCollector) external onlyOwner {
        if (_feeCollector == address(0)) revert InvalidAddress();
        emit FeeCollectorUpdated(feeCollector, _feeCollector);
        feeCollector = _feeCollector;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Emergency withdrawal of any stuck tokens. Owner only.
     */
    function emergencyWithdraw(
        address token,
        address to,
        uint256 amount
    ) external onlyOwner {
        if (to == address(0)) revert InvalidAddress();
        IERC20(token).safeTransfer(to, amount);
    }
}
