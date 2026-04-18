#!/bin/bash
cd /Users/macbook/cross-border-payment

export NODE_ENV=development
export APP_ENV=development
export LOG_LEVEL=debug
export FIREBASE_PROJECT_ID=demo-crossborder
export FUNCTIONS_EMULATOR=true
export FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
export FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
export BASE_RPC_URL=https://sepolia.base.org
export PAYMENT_CONTRACT_ADDRESS=0xC8Abf536BE8AD155F0C30fFcAb3ae7852e072B48
export TREASURY_WALLET_ADDRESS=0xc5BaB95d4738143b8967A2cF14f411F36787DC44
export TREASURY_PRIVATE_KEY=0x53dd5d693bb89c119e9884c3f46b18366d4d5a02ac7f59df0dcc0e1ba5ca44b8
export USDC_CONTRACT_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e
export MAX_TRANSACTION_NGN=5000000
export MIN_TRANSACTION_NGN=1000
export MAX_TRANSACTION_GHS=50000
export MIN_TRANSACTION_GHS=10
export JWT_SECRET=local_dev_secret_key_minimum_32_characters_xx
export ENCRYPTION_KEY=local_dev_encryption_key_32_chars_xx

if [ -d ".emulator-data" ] && [ "$(ls -A .emulator-data)" ]; then
  echo "Loading saved emulator data..."
  firebase emulators:start --project demo-crossborder --import=.emulator-data --export-on-exit=.emulator-data
else
  echo "Starting fresh emulator..."
  firebase emulators:start --project demo-crossborder --export-on-exit=.emulator-data
fi
