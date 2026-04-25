import { ethers } from "ethers";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, ".env") });

const MINT_ABI = [
  "function mint(address to, uint256 amount) external",
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)"
];

async function main() {
  const rpc = process.env.BASE_TESTNET_RPC_URL!;
  const privateKey = process.env.RELAYER_PRIVATE_KEY!;
  const usdcAddress = process.env.MOCK_USDC_ADDRESS!;
  const treasury = process.argv[2];

  if (!treasury) {
    console.error("Usage: ts-node mint-usdc.ts 0xYOUR_TREASURY_ADDRESS");
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(rpc);
  const signer = new ethers.Wallet(privateKey, provider);
  const usdc = new ethers.Contract(usdcAddress, MINT_ABI, signer);

  console.log("Minting 10,000 MockUSDC to", treasury);
  const amount = ethers.parseUnits("10000", 6); // 10,000 USDC

  const tx = await usdc.mint(treasury, amount);
  console.log("Tx submitted:", tx.hash);
  await tx.wait(1);
  console.log("✅ Minted successfully!");

  const bal = await usdc.balanceOf(treasury);
  console.log("Treasury balance:", ethers.formatUnits(bal, 6), "USDC");
}

main().catch(console.error);
