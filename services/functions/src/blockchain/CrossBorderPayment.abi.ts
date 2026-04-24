/**
 * ABI for the Escrow contract deployed on Base Sepolia
 * Escrow:   0xaC11528c36A05C904Bead5Ed3a74d4e40Dd38bfE
 * MockUSDC: 0xB9a0E369995c03d966470D4E86b1bdbAD9bd7dc2
 * Chain:    Base Sepolia (84532)
 */

export const CROSS_BORDER_PAYMENT_ABI = [
  {
    "type": "function",
    "name": "deposit",
    "inputs": [
      { "name": "txId",      "type": "bytes32" },
      { "name": "recipient", "type": "address" },
      { "name": "amount",    "type": "uint256" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "completeTransfer",
    "inputs": [{ "name": "txId", "type": "bytes32" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "cancelTransfer",
    "inputs": [{ "name": "txId", "type": "bytes32" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "getTransfer",
    "inputs": [{ "name": "txId", "type": "bytes32" }],
    "outputs": [
      {
        "type": "tuple",
        "components": [
          { "name": "sender",    "type": "address" },
          { "name": "recipient", "type": "address" },
          { "name": "amount",    "type": "uint256" },
          { "name": "fee",       "type": "uint256" },
          { "name": "netAmount", "type": "uint256" },
          { "name": "status",    "type": "uint8"   },
          { "name": "timestamp", "type": "uint64"  }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "isPending",
    "inputs": [{ "name": "txId", "type": "bytes32" }],
    "outputs": [{ "type": "bool" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "calculateFee",
    "inputs": [{ "name": "amount", "type": "uint256" }],
    "outputs": [{ "type": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "contractBalance",
    "inputs": [],
    "outputs": [{ "type": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "relayer",
    "inputs": [],
    "outputs": [{ "type": "address" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "usdcToken",
    "inputs": [],
    "outputs": [{ "type": "address" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "paused",
    "inputs": [],
    "outputs": [{ "type": "bool" }],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "TransferInitiated",
    "inputs": [
      { "name": "txId",      "type": "bytes32", "indexed": true  },
      { "name": "sender",    "type": "address", "indexed": true  },
      { "name": "recipient", "type": "address", "indexed": false },
      { "name": "amount",    "type": "uint256", "indexed": false },
      { "name": "fee",       "type": "uint256", "indexed": false },
      { "name": "netAmount", "type": "uint256", "indexed": false },
      { "name": "timestamp", "type": "uint64",  "indexed": false }
    ]
  },
  {
    "type": "event",
    "name": "TransferCompleted",
    "inputs": [
      { "name": "txId",      "type": "bytes32", "indexed": true  },
      { "name": "recipient", "type": "address", "indexed": true  },
      { "name": "netAmount", "type": "uint256", "indexed": false },
      { "name": "timestamp", "type": "uint64",  "indexed": false }
    ]
  },
  {
    "type": "event",
    "name": "TransferCancelled",
    "inputs": [
      { "name": "txId",      "type": "bytes32", "indexed": true  },
      { "name": "sender",    "type": "address", "indexed": true  },
      { "name": "amount",    "type": "uint256", "indexed": false },
      { "name": "timestamp", "type": "uint64",  "indexed": false }
    ]
  }
] as const;

export const USDC_ABI = [
  {
    "type": "function",
    "name": "approve",
    "inputs": [
      { "name": "spender", "type": "address" },
      { "name": "amount",  "type": "uint256" }
    ],
    "outputs": [{ "type": "bool" }],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "allowance",
    "inputs": [
      { "name": "owner",   "type": "address" },
      { "name": "spender", "type": "address" }
    ],
    "outputs": [{ "type": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "balanceOf",
    "inputs": [{ "name": "account", "type": "address" }],
    "outputs": [{ "type": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "transfer",
    "inputs": [
      { "name": "to",     "type": "address" },
      { "name": "amount", "type": "uint256" }
    ],
    "outputs": [{ "type": "bool" }],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "decimals",
    "inputs": [],
    "outputs": [{ "type": "uint8" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "mint",
    "inputs": [
      { "name": "to",     "type": "address" },
      { "name": "amount", "type": "uint256" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  }
] as const;
