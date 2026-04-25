const { ethers } = require("../relayer-service/node_modules/ethers");
const fs = require("fs");

const envContent = fs.readFileSync("../.env", "utf8");
const treasuryKey = envContent.split("\n")
  .find(l => l.startsWith("TREASURY_PRIVATE_KEY="))
  .split("=").slice(1).join("=").trim();

const relayerEnv = fs.readFileSync("../relayer-service/.env", "utf8");
const relayerKey = relayerEnv.split("\n")
  .find(l => l.startsWith("RELAYER_PRIVATE_KEY="))
  .split("=").slice(1).join("=").trim();

const escrowArtifact = JSON.parse(
  fs.readFileSync("artifacts/contracts/Escrow.sol/Escrow.json", "utf8")
);

const MOCK_USDC = "0xc57364Ed661dEb72587D4edC019B5606401A99e7";

async function main() {
  const provider = new ethers.JsonRpcProvider("https://sepolia.base.org");
  const treasury = new ethers.Wallet(treasuryKey, provider);
  const relayerWallet = new ethers.Wallet(relayerKey);

  console.log("Treasury:", treasury.address);
  console.log("Relayer: ", relayerWallet.address);

  const Escrow = new ethers.ContractFactory(escrowArtifact.abi, escrowArtifact.bytecode, treasury);

  console.log("\nDeploying Escrow...");
  const escrow = await Escrow.deploy(
    MOCK_USDC,              // usdcToken
    relayerWallet.address,  // relayer
    treasury.address,       // feeRecipient
    50,                     // feeBasisPoints (0.5%)
    treasury.address        // initialOwner
  );
  await escrow.waitForDeployment();
  const escrowAddress = await escrow.getAddress();
  console.log("✅ Escrow:", escrowAddress);

  console.log("\n=== UPDATE THESE EVERYWHERE ===");
  console.log("PAYMENT_CONTRACT_ADDRESS=" + escrowAddress);
  console.log("USDC_CONTRACT_ADDRESS=" + MOCK_USDC);
  console.log("MOCK_USDC_ADDRESS=" + MOCK_USDC);
  console.log("ESCROW_CONTRACT_ADDRESS=" + escrowAddress);

  fs.writeFileSync("new-deployments.json", JSON.stringify({
    mockUsdcAddress: MOCK_USDC,
    escrowAddress,
    relayer: relayerWallet.address,
    treasury: treasury.address,
    network: "Base Sepolia",
    chainId: 84532,
    deployedAt: new Date().toISOString()
  }, null, 2));
  console.log("\n✅ Saved to new-deployments.json");
}

main().catch(console.error);
