// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {HuntersRadar} from "../src/HuntersRadar.sol";
import {MockAgentId} from "../src/MockAgentId.sol";

/// @notice Deploy script for BSC TESTNET (chain 97) only.
///         Deploys MockAgentId, then HuntersRadar pointing at it.
///         For MAINNET, deploy HuntersRadar alone with the real Agent ID
///         address 0x60b9262456de011f7d15a54cdd8c48baaa8b022f as constructor arg
///         (see DeployMainnet.s.sol). NEVER deploy MockAgentId to mainnet.
///
/// Usage (testnet):
///   forge script script/Deploy.s.sol:Deploy --rpc-url $BSC_TESTNET_RPC \
///     --broadcast --private-key $PRIVATE_KEY
contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        MockAgentId mock = new MockAgentId();
        console.log("MockAgentId:", address(mock));

        HuntersRadar radar = new HuntersRadar(address(mock), msg.sender);
        console.log("HuntersRadar:", address(radar));
        console.log("Owner:", radar.owner());

        vm.stopBroadcast();
    }
}
