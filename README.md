# XBorder Payment System — Blockchain Layer

> Nigeria 🇳🇬 ↔️ Ghana 🇬🇭 Cross-Border Payment System  
> Built on Base Sepolia Testnet · Solidity · Ethers.js · TypeScript

---

## Overview

This is the blockchain layer of a production-grade cross-border payment system. It handles trustless USDC escrow between Nigerian senders and Ghanaian recipients using smart contracts on Base (an Ethereum L2).

```
Sender (Nigeria)
    │
    │  deposit(txId, recipient, amount)
    ▼
┌─────────────────────────────┐
│       Escrow Contract       │  ← Holds USDC on-chain
│  0xaC11528c36A05C904Bead... │  ← Emits events
└─────────────────────────────┘
    │
    │  TransferInitiated event
    ▼
┌─────────────────────────────┐
│      Relayer Service        │  ← Watches events
│      (Node.js / TS)         │  ← Notifies backend
└─────────────────────────────┘
    │
    │  completeTransfer(txId)
    ▼
Recipient (Ghana) receives USDC
```

---

## Live Contracts — Base Sepolia Testnet

| Contract  | Address                                      | Basescan |
|-----------|----------------------------------------------|----------|
| MockUSDC  | `0xB9a0E369995c03d966470D4E86b1bdbAD9bd7dc2` | [View ↗](https://sepolia.basescan.org/address/0xB9a0E369995c03d966470D4E86b1bdbAD9bd7dc2#code) |
| Escrow    | `0xaC11528c36A05C904Bead5Ed3a74d4e40Dd38bfE` | [View ↗](https://sepolia.basescan.org/address/0xaC11528c36A05C904Bead5Ed3a74d4e40Dd38bfE#code) |

- **Network:** Base Sepolia (chainId: 84532)
- **Deployer:** `0x3F5e4e0E67f6F83B9B4f4da340d90F5Ae7c83105`
- **Deployed:** 2026-04-19

---

## Project Structure

```
blockchain/
├── contracts/
│   ├── MockUSDC.sol            # Mintable ERC20 (6 decimals, USDC-compatible)
│   └── Escrow.sol              # Trustless USDC escrow with fee model
│
├── scripts/
│   ├── deploy.ts               # Deploy MockUSDC + Escrow to any network
│   ├── exportAbis.ts           # Extract ABIs → abis/ for consumers
│   └── verify.ts               # Verify contracts on Basescan (V2 API)
│
├── abis/
│   ├── MockUSDC.json           # ABI consumed by relayer + frontend
│   └── Escrow.json             # ABI consumed by relayer + frontend
│
├── relayer-service/
│   └── src/
│       ├── index.ts            # Entry point + graceful shutdown
│       ├── config.ts           # Env validation + typed config
│       ├── logger.ts           # Winston structured logging
│       ├── contracts.ts        # Ethers.js provider + contract instances
│       ├── listeners/
│       │   ├── escrowListener.ts   # Real-time events + auto-reconnect
│       │   └── historicalSync.ts   # Missed event replay on startup
│       ├── handlers/
│       │   └── transferHandler.ts  # Business logic per event type
│       ├── services/
│       │   └── backendService.ts   # HTTP client → Firebase backend
│       ├── state/
│       │   └── checkpointStore.ts  # Block checkpoint (disk persistence)
│       └── utils/
│           └── retry.ts            # Exponential backoff retry utility
│
├── test/
│   ├── MockUSDC.test.ts        # 16 unit tests
│   └── Escrow.test.ts          # 28 unit tests
│
├── deployments.json            # Deployment history (auto-generated)
├── hardhat.config.ts           # Hardhat: Base Sepolia, Cancun EVM
├── tsconfig.json               # TypeScript strict mode
├── package.json
├── .env.example                # Environment variable template
└── .env                        # Your secrets (never commit this)
```

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | ≥ 20.x | [nodejs.org](https://nodejs.org) |
| npm | ≥ 10.x | Included with Node.js |
| MetaMask | Latest | [metamask.io](https://metamask.io) |

---

## Setup

### 1. Install dependencies

```bash
cd blockchain
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Open `.env` and fill in all values:

```bash
# ── Blockchain ──────────────────────────────────────────────
DEPLOYER_PRIVATE_KEY=0x...        # Deployer wallet private key
BASE_TESTNET_RPC_URL=https://...  # Alchemy/QuickNode Base Sepolia URL
BASESCAN_API_KEY=...              # From basescan.org/myapikey

# ── Wallets ─────────────────────────────────────────────────
RELAYER_ADDRESS=0x...             # Relayer wallet address (not PK)
RELAYER_PRIVATE_KEY=0x...         # Relayer wallet private key
FEE_RECIPIENT=0x...               # Where protocol fees go

# ── Contracts (filled after deploy) ─────────────────────────
MOCK_USDC_ADDRESS=
ESCROW_CONTRACT_ADDRESS=

# ── Relayer ─────────────────────────────────────────────────
BACKEND_API_URL=https://...       # Firebase Functions URL
RELAYER_API_SECRET=...            # Shared secret with backend

# ── Tuning ──────────────────────────────────────────────────
LOG_LEVEL=info
CONFIRMATIONS=2
POLLING_INTERVAL_MS=4000
MAX_RETRIES=5
RETRY_DELAY_MS=2000
```

### 3. Get testnet ETH

- [faucet.base.org](https://faucet.base.org)
- [alchemy.com/faucets/base-sepolia](https://www.alchemy.com/faucets/base-sepolia)

You need at least **0.05 ETH** in your deployer wallet.

---

## Commands

### Compile contracts

```bash
npx hardhat compile
```

### Run tests

```bash
# All tests
npx hardhat test

# Specific file
npx hardhat test test/Escrow.test.ts

# With gas report
REPORT_GAS=true npx hardhat test
```

### Deploy

```bash
# Local (free, instant)
npx hardhat run scripts/deploy.ts --network localhost

# Base Sepolia testnet
npx hardhat run scripts/deploy.ts --network baseTestnet
```

### Verify on Basescan

```bash
npx hardhat run scripts/verify.ts --network baseTestnet
```

### Export ABIs

```bash
npx ts-node scripts/exportAbis.ts
```

### Start relayer

```bash
npx ts-node relayer-service/src/index.ts
```

### TypeScript check

```bash
npx tsc --noEmit
```

---

## Smart Contracts

### MockUSDC

A mintable ERC20 token simulating USDC on testnet.

| Property | Value |
|----------|-------|
| Name | MockUSDC |
| Symbol | mUSDC |
| Decimals | 6 (matches real USDC) |
| Max Supply | 1,000,000,000 mUSDC |
| Max Mint Per Call | 10,000,000 mUSDC |
| Standard | ERC20 + ERC20Permit + Ownable |

**Key functions:**

```solidity
// Mint tokens (owner only)
function mint(address to, uint256 amount) external onlyOwner

// Convert human amount to raw units
function toRawAmount(uint256 usdcAmount) external pure returns (uint256)

// Check remaining mintable supply
function remainingMintableSupply() external view returns (uint256)
```

**Amount convention:**
```
1 USDC = 1_000_000 raw units (10^6)
100 USDC = 100_000_000 raw units
```

---

### Escrow

Trustless USDC escrow with fee model, pausability, and role-based access.

| Property | Value |
|----------|-------|
| Fee | 50 bps (0.5%) default |
| Max Fee Cap | 500 bps (5%) hardcoded |
| Min Deposit | 1 mUSDC |
| Max Deposit | 50,000 mUSDC (adjustable) |
| Roles | Owner (admin), Relayer (operator) |

**Transfer state machine:**

```
deposit()           completeTransfer()
   │                      │
   ▼                      ▼
PENDING ──────────► COMPLETED
   │
   │  cancelTransfer()
   ▼
CANCELLED
```

**Key functions:**

```solidity
// Sender: lock USDC into escrow
function deposit(bytes32 txId, address recipient, uint256 amount) external

// Relayer: release to recipient (after backend confirms off-ramp)
function completeTransfer(bytes32 txId) external onlyRelayer

// Relayer: refund to sender (on failure or timeout)
function cancelTransfer(bytes32 txId) external onlyRelayer

// Owner: withdraw accumulated protocol fees
function withdrawFees() external onlyOwner

// View: calculate fee for a given amount
function calculateFee(uint256 amount) external view returns (uint256 fee, uint256 netAmount)
```

**Events:**

```solidity
event TransferInitiated(bytes32 indexed txId, address indexed sender, address indexed recipient, uint256 amount, uint256 fee, uint256 netAmount, uint64 timestamp);
event TransferCompleted(bytes32 indexed txId, address indexed recipient, uint256 netAmount, uint64 timestamp);
event TransferCancelled(bytes32 indexed txId, address indexed sender, uint256 amount, uint64 timestamp);
```

---

## Relayer Service

A Node.js/TypeScript service that bridges the blockchain and Firebase backend.

### What it does

1. **Startup** — runs historical sync to replay any events missed while offline
2. **Listens** — watches Escrow events in real-time via ethers.js
3. **Notifies** — POSTs event data to Firebase backend
4. **Acts** — calls `completeTransfer()` or `cancelTransfer()` based on backend response
5. **Recovers** — auto-reconnects on RPC failures with exponential backoff

### Reliability features

| Feature | Implementation |
|---------|---------------|
| Historical replay | Queries past events on startup from last checkpoint |
| Block checkpointing | Saves progress to `.checkpoint-baseSepolia.json` |
| Retry with backoff | All backend calls retry up to 5× with exponential delay |
| Auto-reconnect | Polls provider health every 30s, reconnects on failure |
| Graceful shutdown | SIGTERM/SIGINT handled cleanly |
| Safe-by-default | Backend unreachable → transfer cancelled (protects users) |

### Backend API contract

The relayer expects these endpoints on the backend:

```
GET  /relayer/health                  → 200 OK
POST /relayer/transfer-initiated      → { action: "complete" | "cancel" | "pending" }
POST /relayer/transfer-completed      → 200 OK
POST /relayer/transfer-cancelled      → 200 OK
```

All requests include `x-relayer-secret` header for authentication.

---

## Security Considerations

| Risk | Mitigation |
|------|-----------|
| Reentrancy | `ReentrancyGuard` on all state-changing functions |
| Integer overflow | Solidity 0.8.x built-in overflow protection |
| Token transfer failure | `SafeERC20` for all token operations |
| Admin abuse (fees) | `MAX_FEE_BASIS_POINTS = 500` hardcoded cap |
| Replay attacks | `txIdUsed` mapping prevents duplicate txIds |
| Emergency stop | `Pausable` — owner can pause deposits/completions |
| Relayer key compromise | `updateRelayer()` — owner can rotate key without redeploy |
| Backend failure | Default to cancel — user funds always recoverable |

---

## Test Coverage

```
MockUSDC (16 tests)
  Deployment        5 tests
  Minting           7 tests
  Helper functions  2 tests
  ERC20 behaviour   2 tests

Escrow (28 tests)
  Deployment        3 tests
  deposit()         7 tests
  completeTransfer  5 tests
  cancelTransfer    4 tests
  withdrawFees      2 tests
  Admin controls    4 tests
  View functions    3 tests

Total: 44 passing
```

---

## Known Limitations (Testnet)

| Limitation | Production Fix |
|-----------|---------------|
| Alchemy free tier: 10-block range for `eth_getLogs` | Upgrade to PAYG or use QuickNode |
| Single relayer wallet | Multi-relayer with leader election |
| Disk-based checkpoint | Redis or Firestore checkpoint |
| No transfer timeout | Cron job to cancel stale transfers |
| MockUSDC not real USDC | Use Circle's USDC contract address on mainnet |

---

## Architecture Decisions

**Why Base (Ethereum L2)?**
Low gas fees (~$0.001 per tx), EVM-compatible, fast finality, growing ecosystem in Africa.

**Why Escrow on-chain?**
Removes trust from both parties and the operator. Funds cannot be stolen or double-spent — only released to recipient or refunded to sender.

**Why a separate relayer wallet?**
Security separation. If the relayer key is compromised, attacker can only complete/cancel transfers — they cannot steal funds, change fees, or mint tokens.

**Why ERC20Permit?**
Enables gasless approvals in future — users sign off-chain, relayer submits approval + deposit in one transaction.

**Why 6 decimals?**
Matches real USDC. Consistent math across the entire system — no conversion errors.

---

## Next Layers

```
cross-border-payment/
├── blockchain/     ✅ Complete
├── backend/        ← Next: Firebase Functions + Firestore
└── frontend/       ← After: Next.js + TypeScript
```

---

## License

MIT
