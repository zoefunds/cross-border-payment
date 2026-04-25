const { ethers } = require('./node_modules/ethers');
const fs = require('fs');
const path = require('path');

// Load treasury private key from root .env
const envContent = fs.readFileSync('../.env', 'utf8');
const treasuryKey = envContent.split('\n')
  .find(l => l.startsWith('TREASURY_PRIVATE_KEY='))
  ?.split('=').slice(1).join('=').trim();

const relayerKey = fs.readFileSync('.env', 'utf8').split('\n')
  .find(l => l.startsWith('RELAYER_PRIVATE_KEY='))
  ?.split('=').slice(1).join('=').trim();

if (!treasuryKey || treasuryKey.includes('Your')) {
  console.error('TREASURY_PRIVATE_KEY not set in .env');
  process.exit(1);
}

// MockUSDC bytecode + ABI (simple mintable ERC20)
const MOCK_USDC_ABI = [
  "constructor()",
  "function mint(address to, uint256 amount) external",
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "function name() view returns (string)",
  "function symbol() view returns (string)"
];

async function main() {
  const provider = new ethers.JsonRpcProvider('https://sepolia.base.org');
  const treasury = new ethers.Wallet(treasuryKey, provider);
  
  console.log('Deployer/Treasury:', treasury.address);
  
  const balance = await provider.getBalance(treasury.address);
  console.log('ETH balance:', ethers.formatEther(balance));
  
  if (balance < ethers.parseEther('0.005')) {
    console.error('Need at least 0.005 ETH for deployment. Fund:', treasury.address);
    process.exit(1);
  }

  // Read the compiled MockUSDC from blockchain/contracts
  const mockUsdcJson = JSON.parse(
    fs.readFileSync('../abis/MockUSDC.json', 'utf8')
  );

  console.log('\nDeploying MockUSDC...');
  const MockUSDC = new ethers.ContractFactory(
    mockUsdcJson.abi,
    mockUsdcJson.bytecode,
    treasury
  );
  
  const mockUsdc = await MockUSDC.deploy();
  await mockUsdc.waitForDeployment();
  const mockUsdcAddress = await mockUsdc.getAddress();
  console.log('✅ MockUSDC deployed at:', mockUsdcAddress);

  // Mint 100,000 USDC to treasury
  console.log('\nMinting 100,000 USDC to treasury...');
  const mintTx = await mockUsdc.mint(
    treasury.address,
    ethers.parseUnits('100000', 6)
  );
  await mintTx.wait(1);
  console.log('✅ Minted 100,000 USDC');

  // Read Escrow ABI and bytecode
  const escrowJson = JSON.parse(
    fs.readFileSync('../abis/Escrow.json', 'utf8')
  );

  // Relayer address
  const relayerWallet = new ethers.Wallet(relayerKey);
  console.log('\nRelayer address:', relayerWallet.address);

  console.log('\nDeploying Escrow...');
  const Escrow = new ethers.ContractFactory(
    escrowJson.abi,
    escrowJson.bytecode,
    treasury
  );

  const escrow = await Escrow.deploy(
    mockUsdcAddress,      // usdcToken
    relayerWallet.address, // relayer
    treasury.address,      // feeRecipient
    50,                   // feeBasisPoints (0.5%)
    treasury.address       // initialOwner
  );
  await escrow.waitForDeployment();
  const escrowAddress = await escrow.getAddress();
  console.log('✅ Escrow deployed at:', escrowAddress);

  console.log('\n=== NEW CONTRACT ADDRESSES ===');
  console.log('MockUSDC:', mockUsdcAddress);
  console.log('Escrow:  ', escrowAddress);
  console.log('');
  console.log('Update these in your .env files and Firebase secrets!');

  // Save to a file for easy copy-paste
  fs.writeFileSync('new-deployments.json', JSON.stringify({
    mockUsdcAddress,
    escrowAddress,
    relayer: relayerWallet.address,
    treasury: treasury.address,
    network: 'Base Sepolia',
    chainId: 84532,
    deployedAt: new Date().toISOString()
  }, null, 2));
  
  console.log('\nSaved to new-deployments.json');
}

main().catch(console.error);
