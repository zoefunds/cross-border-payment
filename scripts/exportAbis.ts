import * as fs from "fs";
import * as path from "path";

// ─── Config ───────────────────────────────────────────────────────────────────

/**
 * Contracts to export ABIs for.
 * Add new contracts here as the system grows.
 */
const CONTRACTS_TO_EXPORT = [
  "MockUSDC",
  "Escrow",
] as const;

type ContractName = (typeof CONTRACTS_TO_EXPORT)[number];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(message: string): void {
  console.log(message);
}

/**
 * Find artifact path for a given contract name.
 * Hardhat artifacts live at: artifacts/contracts/<Name>.sol/<Name>.json
 */
function getArtifactPath(contractName: ContractName): string {
  return path.resolve(
    __dirname,
    `../artifacts/contracts/${contractName}.sol/${contractName}.json`
  );
}

/**
 * Extract and validate ABI from a Hardhat artifact file
 */
function extractAbi(contractName: ContractName): object[] {
  const artifactPath = getArtifactPath(contractName);

  if (!fs.existsSync(artifactPath)) {
    throw new Error(
      `Artifact not found for ${contractName}.\n` +
      `   Expected: ${artifactPath}\n` +
      `   Run: npx hardhat compile`
    );
  }

  const raw = fs.readFileSync(artifactPath, "utf-8");
  const artifact = JSON.parse(raw) as { abi: object[] };

  if (!artifact.abi || !Array.isArray(artifact.abi)) {
    throw new Error(`Invalid artifact for ${contractName} — no ABI found`);
  }

  return artifact.abi;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main(): void {
  log("📤 Exporting ABIs...\n");

  // ── Ensure abis/ directory exists ───────────────────────────────────────
  const abisDir = path.resolve(__dirname, "../abis");
  if (!fs.existsSync(abisDir)) {
    fs.mkdirSync(abisDir, { recursive: true });
    log(`   Created directory: abis/`);
  }

  // ── Export each contract ─────────────────────────────────────────────────
  const results: Array<{ name: string; path: string; count: number }> = [];

  for (const contractName of CONTRACTS_TO_EXPORT) {
    try {
      const abi = extractAbi(contractName);
      const outputPath = path.join(abisDir, `${contractName}.json`);

      fs.writeFileSync(outputPath, JSON.stringify(abi, null, 2));

      results.push({
        name:  contractName,
        path:  outputPath,
        count: abi.length,
      });

      log(`   ✅ ${contractName}.json — ${abi.length} entries`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`   ❌ ${contractName}: ${message}`);
      process.exit(1);
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  log(`\n✅ Exported ${results.length} ABIs to abis/`);
  log("\nFiles:");
  results.forEach((r) => log(`   → abis/${r.name}.json`));

  log(
    "\n💡 These files are consumed by:\n" +
    "   - relayer-service/src/ (Step 6)\n" +
    "   - frontend/src/lib/contracts/ (future)"
  );
}

// ─── Entry Point ─────────────────────────────────────────────────────────────
try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\n❌ Export failed: ${message}`);
  process.exit(1);
}