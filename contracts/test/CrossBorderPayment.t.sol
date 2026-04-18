// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/CrossBorderPayment.sol";

// Minimal ERC20 mock for testing
contract MockUSDC {
    string public name = "USD Coin";
    string public symbol = "USDC";
    uint8 public decimals = 6;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "insufficient");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "insufficient balance");
        require(allowance[from][msg.sender] >= amount, "insufficient allowance");
        balanceOf[from] -= amount;
        allowance[from][msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }
}

contract CrossBorderPaymentTest is Test {
    CrossBorderPayment public cbp;
    MockUSDC public usdc;

    address public owner = address(1);
    address public treasury = address(2);
    address public feeCollector = address(3);
    address public recipient = address(4);

    uint256 constant USDC_AMOUNT = 100e6; // 100 USDC
    bytes32 constant PAYMENT_ID = keccak256("test-payment-001");
    string constant FIREBASE_TX_ID = "firebase-tx-001";

    function setUp() public {
        usdc = new MockUSDC();
        vm.prank(owner);
        cbp = new CrossBorderPayment(address(usdc), treasury, feeCollector);

        // Fund treasury
        usdc.mint(treasury, 10_000e6);

        // Approve contract to spend treasury USDC
        vm.prank(treasury);
        usdc.approve(address(cbp), type(uint256).max);
    }

    // ── Initiate Tests ─────────────────────────────────────────────────

    function test_InitiatePayment_Success() public {
        vm.prank(owner);
        cbp.initiatePayment(PAYMENT_ID, recipient, USDC_AMOUNT, FIREBASE_TX_ID);

        CrossBorderPayment.Payment memory p = cbp.getPayment(PAYMENT_ID);
        assertEq(p.amount, USDC_AMOUNT);
        assertEq(p.recipient, recipient);
        assertEq(uint8(p.status), uint8(CrossBorderPayment.PaymentStatus.INITIATED));
        assertEq(p.firebaseTxId, FIREBASE_TX_ID);
    }

    function test_InitiatePayment_EmitsEvent() public {
        uint256 fee = (USDC_AMOUNT * 150) / 10_000;

        vm.expectEmit(true, true, true, false);
        emit CrossBorderPayment.PaymentInitiated(
            PAYMENT_ID, treasury, recipient, USDC_AMOUNT, fee, FIREBASE_TX_ID, 0
        );

        vm.prank(owner);
        cbp.initiatePayment(PAYMENT_ID, recipient, USDC_AMOUNT, FIREBASE_TX_ID);
    }

    function test_InitiatePayment_LocksUSDC() public {
        uint256 fee = (USDC_AMOUNT * 150) / 10_000;
        uint256 totalRequired = USDC_AMOUNT + fee;

        uint256 balanceBefore = usdc.balanceOf(treasury);

        vm.prank(owner);
        cbp.initiatePayment(PAYMENT_ID, recipient, USDC_AMOUNT, FIREBASE_TX_ID);

        assertEq(usdc.balanceOf(treasury), balanceBefore - totalRequired);
        assertEq(usdc.balanceOf(address(cbp)), totalRequired);
        assertEq(cbp.totalLocked(), totalRequired);
    }

    function test_InitiatePayment_RevertIfDuplicate() public {
        vm.prank(owner);
        cbp.initiatePayment(PAYMENT_ID, recipient, USDC_AMOUNT, FIREBASE_TX_ID);

        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(
                CrossBorderPayment.PaymentAlreadyExists.selector, PAYMENT_ID
            )
        );
        cbp.initiatePayment(PAYMENT_ID, recipient, USDC_AMOUNT, FIREBASE_TX_ID);
    }

    function test_InitiatePayment_RevertIfZeroAmount() public {
        vm.prank(owner);
        vm.expectRevert(CrossBorderPayment.InvalidAmount.selector);
        cbp.initiatePayment(PAYMENT_ID, recipient, 0, FIREBASE_TX_ID);
    }

    function test_InitiatePayment_RevertIfNotOwner() public {
        vm.prank(address(99));
        vm.expectRevert();
        cbp.initiatePayment(PAYMENT_ID, recipient, USDC_AMOUNT, FIREBASE_TX_ID);
    }

    // ── Release Tests ──────────────────────────────────────────────────

    function test_ReleasePayment_Success() public {
        vm.prank(owner);
        cbp.initiatePayment(PAYMENT_ID, recipient, USDC_AMOUNT, FIREBASE_TX_ID);

        vm.prank(owner);
        cbp.releasePayment(PAYMENT_ID);

        CrossBorderPayment.Payment memory p = cbp.getPayment(PAYMENT_ID);
        assertEq(uint8(p.status), uint8(CrossBorderPayment.PaymentStatus.RELEASED));
        assertEq(usdc.balanceOf(recipient), USDC_AMOUNT);
    }

    function test_ReleasePayment_SendsFeeToCollector() public {
        uint256 fee = (USDC_AMOUNT * 150) / 10_000;

        vm.prank(owner);
        cbp.initiatePayment(PAYMENT_ID, recipient, USDC_AMOUNT, FIREBASE_TX_ID);

        vm.prank(owner);
        cbp.releasePayment(PAYMENT_ID);

        assertEq(usdc.balanceOf(feeCollector), fee);
    }

    function test_ReleasePayment_RevertIfExpired() public {
        vm.prank(owner);
        cbp.initiatePayment(PAYMENT_ID, recipient, USDC_AMOUNT, FIREBASE_TX_ID);

        // Warp past expiry
        vm.warp(block.timestamp + 25 hours);

        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(
                CrossBorderPayment.PaymentExpiredError.selector, PAYMENT_ID
            )
        );
        cbp.releasePayment(PAYMENT_ID);
    }

    // ── Refund Tests ───────────────────────────────────────────────────

    function test_RefundPayment_Success() public {
        uint256 fee = (USDC_AMOUNT * 150) / 10_000;
        uint256 totalRequired = USDC_AMOUNT + fee;
        uint256 balanceBefore = usdc.balanceOf(treasury);

        vm.prank(owner);
        cbp.initiatePayment(PAYMENT_ID, recipient, USDC_AMOUNT, FIREBASE_TX_ID);

        vm.prank(owner);
        cbp.refundPayment(PAYMENT_ID, "Test refund");

        CrossBorderPayment.Payment memory p = cbp.getPayment(PAYMENT_ID);
        assertEq(uint8(p.status), uint8(CrossBorderPayment.PaymentStatus.REFUNDED));
        assertEq(usdc.balanceOf(treasury), balanceBefore - totalRequired + totalRequired);
        assertEq(cbp.totalLocked(), 0);
    }

    // ── Expiry Tests ───────────────────────────────────────────────────

    function test_ExpirePayment_Success() public {
        vm.prank(owner);
        cbp.initiatePayment(PAYMENT_ID, recipient, USDC_AMOUNT, FIREBASE_TX_ID);

        vm.warp(block.timestamp + 25 hours);
        cbp.expirePayment(PAYMENT_ID);

        CrossBorderPayment.Payment memory p = cbp.getPayment(PAYMENT_ID);
        assertEq(uint8(p.status), uint8(CrossBorderPayment.PaymentStatus.EXPIRED));
    }

    // ── Admin Tests ────────────────────────────────────────────────────

    function test_Pause_BlocksInitiate() public {
        vm.prank(owner);
        cbp.pause();

        vm.prank(owner);
        vm.expectRevert();
        cbp.initiatePayment(PAYMENT_ID, recipient, USDC_AMOUNT, FIREBASE_TX_ID);
    }

    function test_SetFee_UpdatesCorrectly() public {
        vm.prank(owner);
        cbp.setFeeBasisPoints(200); // 2%
        assertEq(cbp.feeBasisPoints(), 200);
    }

    function test_SetFee_RevertIfTooHigh() public {
        vm.prank(owner);
        vm.expectRevert(CrossBorderPayment.InvalidFee.selector);
        cbp.setFeeBasisPoints(1001); // > 10%
    }

    function test_Fuzz_InitiateAndRelease(uint256 amount) public {
        amount = bound(amount, 1e6, 1_000_000e6); // 1 to 1M USDC
        usdc.mint(treasury, amount * 2);

        vm.prank(owner);
        cbp.initiatePayment(PAYMENT_ID, recipient, amount, FIREBASE_TX_ID);

        vm.prank(owner);
        cbp.releasePayment(PAYMENT_ID);

        assertEq(usdc.balanceOf(recipient), amount);
    }
}
