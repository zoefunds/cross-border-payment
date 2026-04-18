// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/CrossBorderPayment.sol";

contract DeployScript is Script {
    // Base Sepolia USDC address
    address constant USDC_BASE_SEPOLIA = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("TREASURY_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("Deploying CrossBorderPayment...");
        console.log("Deployer:", deployer);
        console.log("USDC:", USDC_BASE_SEPOLIA);

        vm.startBroadcast(deployerPrivateKey);

        CrossBorderPayment contract_ = new CrossBorderPayment(
            USDC_BASE_SEPOLIA,
            deployer,  // treasury = deployer wallet for testnet
            deployer   // feeCollector = deployer wallet for testnet
        );

        vm.stopBroadcast();

        console.log("CrossBorderPayment deployed at:", address(contract_));
        console.log("Owner:", contract_.owner());
        console.log("Treasury:", contract_.treasury());
        console.log("USDC:", address(contract_.usdc()));
    }
}
