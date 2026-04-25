import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";
dotenvConfig({ path: resolve(process.cwd(), "../.env") });

export default {
  solidity: "0.8.28",
  networks: {
    baseSepolia: {
      type: "http",
      url: "https://sepolia.base.org",
      accounts: [process.env.TREASURY_PRIVATE_KEY],
      chainId: 84532,
    },
  },
};
