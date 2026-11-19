// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {HuntersRadar} from "../src/HuntersRadar.sol";

/// @notice Deploy script for BSC MAINNET (chain 56).
///         Deploys HuntersRadar pointing at the REAL Agent ID contract.
///         DO NOT RUN without explicit go-ahead: mainnet deploy is a
///         one-shot operation (gas budget ~0.000075 BNB, no redeploy margin).
///
/// Usage:
///   forge script script/DeployMainnet.s.sol:DeployMainnet \
///     --rpc-url https://bsc-dataseed.binance.org --broadcast \
///     --private-key $PRIVATE_KEY
contract DeployMainnet is Script {
    address public constant AGENT_ID = 0x60b9262456de011f7d15a54cdd8c48baaa8b022f;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        HuntersRadar radar = new HuntersRadar(AGENT_ID);
        console.log("HuntersRadar (mainnet):", address(radar));
        console.log("Agent ID:", radar.agentId());
        console.log("Owner:", radar.owner());

        vm.stopBroadcast();
    }
}
