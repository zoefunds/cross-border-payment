const { ethers } = require("../relayer-service/node_modules/ethers");
const fs = require("fs");

const envContent = fs.readFileSync("../.env", "utf8");
const treasuryKey = envContent.split("\n")
  .find(l => l.startsWith("TREASURY_PRIVATE_KEY="))
  .split("=").slice(1).join("=").trim();

const artifact = JSON.parse(
  fs.readFileSync("artifacts/contracts/MockUSDC.sol/MockUSDC.json", "utf8")
);

const MOCK_USDC = "0xc57364Ed661dEb72587D4edC019B5606401A99e7";
const TREASURY = "0x915848269309Ad07A562F49aE04Db66B76db7fE1";

async function main() {
  const provider = new ethers.JsonRpcProvider("https://sepolia.base.org");
  const signer = new ethers.Wallet(treasuryKey, provider);
  
  console.log("Signer:", signer.address);
  
  const usdc = new ethers.Contract(MOCK_USDC, artifact.abi, signer);
  
  // Check owner
  const owner = await usdc.owner();
  console.log("Contract owner:", owner);
  console.log("Is owner?", owner.toLowerCase() === signer.address.toLowerCase());

  console.log("Minting 100,000 USDC...");
  const amount = ethers.parseUnits("100000", 6);
  console.log("Amount:", amount.toString());
  
  const tx = await usdc.mint(TREASURY, amount);
  console.log("Tx hash:", tx.hash);
  await tx.wait(1);
  console.log("✅ Minted!");
  
  const bal = await usdc.balanceOf(TREASURY);
  console.log("Balance:", ethers.formatUnits(bal, 6), "USDC");
}

main().catch(console.error);
