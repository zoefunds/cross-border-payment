import { ethers } from "../relayer-service/node_modules/ethers/lib.esm/index.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load keys
const envContent = fs.readFileSync(path.join(__dirname, "../.env"), "utf8");
const treasuryKey = envContent.split("\n")
  .find(l => l.startsWith("TREASURY_PRIVATE_KEY="))
  ?.split("=").slice(1).join("=").trim();

const relayerEnv = fs.readFileSync(path.join(__dirname, "../relayer-service/.env"), "utf8");
const relayerKey = relayerEnv.split("\n")
  .find(l => l.startsWith("RELAYER_PRIVATE_KEY="))
  ?.split("=").slice(1).join("=").trim();

// Load compiled artifacts
const mockUsdcArtifact = JSON.parse(
  fs.readFileSync(path.join(__dirname, "artifacts/contracts/MockUSDC.sol/MockUSDC.json"), "utf8")
);
const escrowArtifact = JSON.parse(
  fs.readFileSync(path.join(__dirname, "artifacts/contracts/Escrow.sol/Escrow.json"), "utf8")
);

async function main() {
  const provider = new ethers.JsonRpcProvider("https://sepolia.base.org");
  const signer = new ethers.Wallet(treasuryKey, provider);
  const relayerWallet = new ethers.Wallet(relayerKey);

  console.log("Treasury:", signer.address);
  console.log("Relayer: ", relayerWallet.address);

  const balance = await provider.getBalance(signer.address);
  console.log("ETH:     ", ethers.formatEther(balance));

  if (balance < ethers.parseEther("0.005")) {
    console.error("Need more ETH"); process.exit(1);
  }

  // Deploy MockUSDC
  console.log("\nDeploying MockUSDC...");
  const MockUSDC = new ethers.ContractFactory(mockUsdcArtifact.abi, mockUsdcArtifact.bytecode, signer);
  const mockUsdc = await MockUSDC.deploy(signer.address);
  await mockUsdc.waitForDeployment();
  const mockUsdcAddress = await mockUsdc.getAddress();
  console.log("✅ MockUSDC:", mockUsdcAddress);

  // Mint 100k USDC
  console.log("\nMinting 100,000 USDC...");
  const mintTx = await mockUsdc.mint(signer.address, ethers.parseUnits("100000", 6));
  await mintTx.wait(1);
  console.log("✅ Minted!");

  // Deploy Escrow
  console.log("\nDeploying Escrow...");
  const Escrow = new ethers.ContractFactory(escrowArtifact.abi, escrowArtifact.bytecode, signer);
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
  console.log("\n✅ Saved to new-deployments.json");
}

main().catch(e => { console.error(e); process.exit(1); });
