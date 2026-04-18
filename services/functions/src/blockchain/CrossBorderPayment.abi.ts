export const CROSS_BORDER_PAYMENT_ABI = [
  {
    "type": "constructor",
    "inputs": [
      { "name": "_usdc", "type": "address" },
      { "name": "_treasury", "type": "address" },
      { "name": "_feeCollector", "type": "address" }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "initiatePayment",
    "inputs": [
      { "name": "paymentId", "type": "bytes32" },
      { "name": "recipient", "type": "address" },
      { "name": "amount", "type": "uint256" },
      { "name": "firebaseTxId", "type": "string" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "releasePayment",
    "inputs": [
      { "name": "paymentId", "type": "bytes32" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "refundPayment",
    "inputs": [
      { "name": "paymentId", "type": "bytes32" },
      { "name": "reason", "type": "string" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "getPayment",
    "inputs": [{ "name": "paymentId", "type": "bytes32" }],
    "outputs": [
      {
        "type": "tuple",
        "components": [
          { "name": "paymentId", "type": "bytes32" },
          { "name": "sender", "type": "address" },
          { "name": "recipient", "type": "address" },
          { "name": "amount", "type": "uint256" },
          { "name": "fee", "type": "uint256" },
          { "name": "createdAt", "type": "uint256" },
          { "name": "expiresAt", "type": "uint256" },
          { "name": "status", "type": "uint8" },
          { "name": "firebaseTxId", "type": "string" }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "treasury",
    "inputs": [],
    "outputs": [{ "type": "address" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "feeBasisPoints",
    "inputs": [],
    "outputs": [{ "type": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "totalLocked",
    "inputs": [],
    "outputs": [{ "type": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "PaymentInitiated",
    "inputs": [
      { "name": "paymentId", "type": "bytes32", "indexed": true },
      { "name": "sender", "type": "address", "indexed": true },
      { "name": "recipient", "type": "address", "indexed": true },
      { "name": "amount", "type": "uint256", "indexed": false },
      { "name": "fee", "type": "uint256", "indexed": false },
      { "name": "firebaseTxId", "type": "string", "indexed": false },
      { "name": "expiresAt", "type": "uint256", "indexed": false }
    ]
  },
  {
    "type": "event",
    "name": "PaymentReleased",
    "inputs": [
      { "name": "paymentId", "type": "bytes32", "indexed": true },
      { "name": "recipient", "type": "address", "indexed": true },
      { "name": "amount", "type": "uint256", "indexed": false },
      { "name": "fee", "type": "uint256", "indexed": false },
      { "name": "firebaseTxId", "type": "string", "indexed": false }
    ]
  },
  {
    "type": "event",
    "name": "PaymentRefunded",
    "inputs": [
      { "name": "paymentId", "type": "bytes32", "indexed": true },
      { "name": "treasury", "type": "address", "indexed": true },
      { "name": "amount", "type": "uint256", "indexed": false },
      { "name": "reason", "type": "string", "indexed": false }
    ]
  }
] as const;

export const USDC_ABI = [
  {
    "type": "function",
    "name": "approve",
    "inputs": [
      { "name": "spender", "type": "address" },
      { "name": "amount", "type": "uint256" }
    ],
    "outputs": [{ "type": "bool" }],
    "stateMutability": "nonpayable"
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
    "name": "allowance",
    "inputs": [
      { "name": "owner", "type": "address" },
      { "name": "spender", "type": "address" }
    ],
    "outputs": [{ "type": "uint256" }],
    "stateMutability": "view"
  }
] as const;
