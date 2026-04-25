const { ethers } = require('./node_modules/ethers');
const fs = require('fs');
const env = fs.readFileSync('../.env', 'utf8');
const line = env.split('\n').find(l => l.startsWith('TREASURY_PRIVATE_KEY='));
const key = line ? line.split('=').slice(1).join('=').trim() : null;
if (!key || key.includes('Your')) {
  console.log('ERROR: TREASURY_PRIVATE_KEY not set in .env');
  process.exit(1);
}
const wallet = new ethers.Wallet(key);
console.log('Treasury address:', wallet.address);
