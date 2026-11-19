// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {HuntersRadar} from "../src/HuntersRadar.sol";
import {MockAgentId} from "../src/MockAgentId.sol";

/// @dev Dummy contract used as a stand-in mint contract address.
contract DummyMint {}

contract HuntersRadarTest is Test {
    HuntersRadar public radar;
    MockAgentId public agentId;

    address public holder1 = address(0xA11CE);
    address public holder2 = address(0xB0B);
    address public nonHolder = address(0xCAFE);
    DummyMint public dummy1;
    DummyMint public dummy2;

    event MintSubmitted(
        uint256 indexed mintId, address indexed mintContract, address indexed submitter, string name
    );
    event Voted(uint256 indexed mintId, address indexed voter, bool up);
    event MintStatusChanged(uint256 indexed mintId, bool active);

    function setUp() public {
        agentId = new MockAgentId();
        radar = new HuntersRadar(address(agentId));
        agentId.mint(holder1);
        agentId.mint(holder2);
        dummy1 = new DummyMint();
        dummy2 = new DummyMint();
    }

    // --- submit ---

    function test_SubmitSucceedsForHolder() public {
        vm.prank(holder1);
        uint256 id = radar.submitMint(address(dummy1), "Test Mint", "https://example.com");
        assertEq(id, 0);
        assertEq(radar.mintCount(), 1);

        HuntersRadar.Mint memory m = radar.getMint(0);
        assertEq(m.mintContract, address(dummy1));
        assertEq(m.name, "Test Mint");
        assertEq(m.infoUri, "https://example.com");
        assertEq(m.submitter, holder1);
        assertEq(m.score, 0);
        assertEq(m.upvotes, 0);
        assertEq(m.downvotes, 0);
        assertTrue(m.active);
    }

    function test_SubmitRevertsForNonHolder() public {
        vm.prank(nonHolder);
        vm.expectRevert(HuntersRadar.NotAgentIdHolder.selector);
        radar.submitMint(address(dummy1), "Test Mint", "");
    }

    function test_SubmitDuplicateReverts() public {
        vm.prank(holder1);
        radar.submitMint(address(dummy1), "First", "");
        vm.prank(holder2);
        vm.expectRevert(HuntersRadar.DuplicateMint.selector);
        radar.submitMint(address(dummy1), "Second", "");
    }

    function test_SubmitNonContractReverts() public {
        vm.prank(holder1);
        vm.expectRevert(HuntersRadar.InvalidMintContract.selector);
        radar.submitMint(address(0x1234), "EOA", ""); // EOA, no code
    }

    function test_SubmitZeroAddressReverts() public {
        vm.prank(holder1);
        vm.expectRevert(HuntersRadar.InvalidMintContract.selector);
        radar.submitMint(address(0), "Zero", "");
    }

    function test_SubmitEmitsEvent() public {
        vm.expectEmit(true, true, true, true);
        emit MintSubmitted(0, address(dummy1), holder1, "Test Mint");
        vm.prank(holder1);
        radar.submitMint(address(dummy1), "Test Mint", "");
    }

    // --- vote ---

    function _submit() internal returns (uint256) {
        vm.prank(holder1);
        return radar.submitMint(address(dummy1), "Test Mint", "");
    }

    function test_VoteUp() public {
        uint256 id = _submit();
        vm.prank(holder2);
        radar.vote(id, true);
        HuntersRadar.Mint memory m = radar.getMint(id);
        assertEq(m.upvotes, 1);
        assertEq(m.downvotes, 0);
        assertEq(m.score, 1);
        assertEq(radar.getVote(id, holder2), 1);
    }

    function test_VoteDown() public {
        uint256 id = _submit();
        vm.prank(holder2);
        radar.vote(id, false);
        HuntersRadar.Mint memory m = radar.getMint(id);
        assertEq(m.upvotes, 0);
        assertEq(m.downvotes, 1);
        assertEq(m.score, -1);
        assertEq(radar.getVote(id, holder2), -1);
    }

    function test_VoteSameDirectionTwiceReverts() public {
        uint256 id = _submit();
        vm.prank(holder2);
        radar.vote(id, true);
        vm.prank(holder2);
        vm.expectRevert(HuntersRadar.AlreadyVoted.selector);
        radar.vote(id, true);
    }

    function test_VoteChangeFlipsScore() public {
        uint256 id = _submit();
        vm.prank(holder2);
        radar.vote(id, true);
        vm.prank(holder2);
        radar.vote(id, false); // change up -> down
        HuntersRadar.Mint memory m = radar.getMint(id);
        assertEq(m.upvotes, 0);
        assertEq(m.downvotes, 1);
        assertEq(m.score, -1);
        assertEq(radar.getVote(id, holder2), -1);

        vm.prank(holder2);
        radar.vote(id, true); // change back down -> up
        m = radar.getMint(id);
        assertEq(m.upvotes, 1);
        assertEq(m.downvotes, 0);
        assertEq(m.score, 1);
    }

    function test_VoteRevertsForNonHolder() public {
        uint256 id = _submit();
        vm.prank(nonHolder);
        vm.expectRevert(HuntersRadar.NotAgentIdHolder.selector);
        radar.vote(id, true);
    }

    function test_VoteInvalidMintReverts() public {
        vm.prank(holder1);
        vm.expectRevert(HuntersRadar.InvalidMintId.selector);
        radar.vote(99, true);
    }

    function test_VoteEmitsEvent() public {
        uint256 id = _submit();
        vm.expectEmit(true, true, false, true);
        emit Voted(id, holder2, true);
        vm.prank(holder2);
        radar.vote(id, true);
    }

    function test_MultipleVotersAggregate() public {
        uint256 id = _submit();
        vm.prank(holder1);
        radar.vote(id, true);
        vm.prank(holder2);
        radar.vote(id, false);
        HuntersRadar.Mint memory m = radar.getMint(id);
        assertEq(m.upvotes, 1);
        assertEq(m.downvotes, 1);
        assertEq(m.score, 0);
    }

    // --- setActive ---

    function test_SetActiveOnlyOwner() public {
        uint256 id = _submit();
        vm.prank(holder1);
        vm.expectRevert(HuntersRadar.NotOwner.selector);
        radar.setActive(id, false);
    }

    function test_SetActiveWorksForOwner() public {
        uint256 id = _submit();
        // test contract is the deployer => owner
        radar.setActive(id, false);
        assertFalse(radar.getMint(id).active);
        radar.setActive(id, true);
        assertTrue(radar.getMint(id).active);
    }

    function test_SetActiveEmitsEvent() public {
        uint256 id = _submit();
        vm.expectEmit(true, false, false, true);
        emit MintStatusChanged(id, false);
        radar.setActive(id, false);
    }

    function test_SetActiveInvalidMintReverts() public {
        vm.expectRevert(HuntersRadar.InvalidMintId.selector);
        radar.setActive(99, false);
    }

    // --- views ---

    function test_HasAgentId() public view {
        assertTrue(radar.hasAgentId(holder1));
        assertTrue(radar.hasAgentId(holder2));
        assertFalse(radar.hasAgentId(nonHolder));
    }

    function test_GetVoteDefaultZero() public {
        uint256 id = _submit();
        assertEq(radar.getVote(id, holder2), 0);
    }

    function test_GetMintInvalidReverts() public {
        vm.expectRevert(HuntersRadar.InvalidMintId.selector);
        radar.getMint(99);
    }

    function test_OwnerIsDeployer() public view {
        assertEq(radar.owner(), address(this));
    }

    function test_MintCountIncrements() public {
        assertEq(radar.mintCount(), 0);
        vm.prank(holder1);
        radar.submitMint(address(dummy1), "One", "");
        assertEq(radar.mintCount(), 1);
        vm.prank(holder2);
        radar.submitMint(address(dummy2), "Two", "");
        assertEq(radar.mintCount(), 2);
    }
}
