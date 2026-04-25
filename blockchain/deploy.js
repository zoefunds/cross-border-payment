import { task } from "hardhat/config.js";
import fs from "fs";

const relayerEnv = fs.readFileSync("../relayer-service/.env", "utf8");
const relayerKey = relayerEnv.split("\n")
  .find(l => l.startsWith("RELAYER_PRIVATE_KEY="))
  ?.split("=").slice(1).join("=").trim();

async function main(hre) {
  const ethers = hre.ethers;
  const [deployer] = await hre.network.provider.send("eth_accounts", []);
  
  console.log("Network:", hre.network.name);
  
  // Get signer differently in v3
  const provider = new ethers.JsonRpcProvider("https://sepolia.base.org");
  const envContent = fs.readFileSync("../.env", "utf8");
  const treasuryKey = envContent.split("\n")
    .find(l => l.startsWith("TREASURY_PRIVATE_KEY="))
    ?.split("=").slice(1).join("=").trim();
  
  const signer = new ethers.Wallet(treasuryKey, provider);
  console.log("Deployer:", signer.address);
  
  const balance = await provider.getBalance(signer.address);
  console.log("Balance:", ethers.formatEther(balance), "ETH");

  const mockUsdcArtifact = await hre.artifacts.readArtifact("MockUSDC");
  const MockUSDC = new ethers.ContractFactory(mockUsdcArtifact.abi, mockUsdcArtifact.bytecode, signer);
  
  console.log("\nDeploying MockUSDC...");
  const mockUsdc = await MockUSDC.deploy(signer.address);
  await mockUsdc.waitForDeployment();
  const mockUsdcAddress = await mockUsdc.getAddress();
  console.log("✅ MockUSDC:", mockUsdcAddress);

  console.log("\nMinting 100,000 USDC...");
  const mintTx = await mockUsdc.mint(signer.address, ethers.parseUnits("100000", 6));
  await mintTx.wait(1);
  console.log("✅ Minted!");

  const relayerWallet = new ethers.Wallet(relayerKey);
  console.log("\nRelayer:", relayerWallet.address);

  const escrowArtifact = await hre.artifacts.readArtifact("Escrow");
  const Escrow = new ethers.ContractFactory(escrowArtifact.abi, escrowArtifact.bytecode, signer);

  console.log("\nDeploying Escrow...");
  const escrow = await Escrow.deploy(
    mockUsdcAddress, relayerWallet.address,
    signer.address, 50, signer.address
  );
  await escrow.waitForDeployment();
  const escrowAddress = await escrow.getAddress();
  console.log("✅ Escrow:", escrowAddress);

  console.log("\n=== SAVE THESE ===");
  console.log("PAYMENT_CONTRACT_ADDRESS=" + escrowAddress);
  console.log("USDC_CONTRACT_ADDRESS=" + mockUsdcAddress);
  console.log("MOCK_USDC_ADDRESS=" + mockUsdcAddress);
  console.log("ESCROW_CONTRACT_ADDRESS=" + escrowAddress);

  fs.writeFileSync("new-deployments.json", JSON.stringify({
    mockUsdcAddress, escrowAddress,
    relayer: relayerWallet.address,
    treasury: signer.address,
    network: "Base Sepolia", chainId: 84532,
    deployedAt: new Date().toISOString()
  }, null, 2));
  console.log("\nSaved to new-deployments.json ✅");
}

// Hardhat v3 entrypoint
const hre = await import("hardhat").then(m => m.default);
await main(hre);
