const { ethers } = require('./node_modules/ethers');
const fs = require('fs');

// Load keys
const env = fs.readFileSync('../.env', 'utf8');
const treasuryKey = env.split('\n').find(l => l.startsWith('TREASURY_PRIVATE_KEY=')).split('=').slice(1).join('=').trim();
const relayerEnv = fs.readFileSync('.env', 'utf8');
const relayerKey = relayerEnv.split('\n').find(l => l.startsWith('RELAYER_PRIVATE_KEY=')).split('=').slice(1).join('=').trim();

// Check what's in the ABI files
const mockUsdcRaw = JSON.parse(fs.readFileSync('../abis/MockUSDC.json', 'utf8'));
console.log('MockUSDC JSON keys:', Object.keys(mockUsdcRaw));
const escrowRaw = JSON.parse(fs.readFileSync('../abis/Escrow.json', 'utf8'));
console.log('Escrow JSON keys:', Object.keys(escrowRaw));
