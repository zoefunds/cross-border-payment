
# Cross-Border Payment System — Nigeria 🇳🇬 ↔ Ghana 🇬🇭

Production-grade cross-border payment system built on Firebase + Base blockchain.

## Architecture

- **Backend**: Firebase Functions (TypeScript)

- **Database**: Firestore

- **Blockchain**: Base Sepolia (Solidity + Ethers.js)

- **Smart Contract**: `0xC8Abf536BE8AD155F0C30fFcAb3ae7852e072B48`

## Services

| Service | Description |

|---------|-------------|

| Auth Service | User registration, profiles, crypto wallets |

| Transaction Service | State machine driven payments |

| FX Service | Live exchange rates with cache |

| Ledger Service | Double-entry bookkeeping |

| Liquidity Service | Treasury USDC monitoring |

| Recovery Service | Crash recovery for stuck transactions |

## Transaction Flow



## Smart Contract

Deployed on Base Sepolia:

- Address: `0xC8Abf536BE8AD155F0C30fFcAb3ae7852e072B48`

- USDC: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`

## Setup

```bash

# Install dependencies

npm install

cd services/functions && npm install

# Copy env file

cp .env.example .env

# Fill in your values

# Start emulator

./start-emulator.sh

# Run tests

./test-api.sh

```

## API Base URL

Local: `http://127.0.0.1:5001/demo-crossborder/us-central1/api`

## Environment Variables

See `.env.example` for all required variables.

## Tech Stack

- TypeScript (strict mode)

- Firebase Admin SDK

- Express.js

- Ethers.js v6

- Solidity 0.8.24

- Foundry (contract testing)

- Zod (validation)

- Winston (logging)

