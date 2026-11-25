// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title HuntersRadar
/// @notice Registry of verified free mints for Binance Agent ID holders.
///         Only Agent ID holders (balanceOf > 0 on the Agent ID contract)
///         can submit mints or vote. No fees, no token, no upgradeability.
/// @dev Built for the Binance Agent ID Hackathon (Nov–Dec 2026).
///      Mainnet Agent ID contract: 0x60b9262456de011f7d15a54cdd8c48baaa8b022f
///      (SPACE ID, ERC-721, non-transferable). On testnet, deploy MockAgentId
///      and pass its address to the constructor instead.

interface IAgentId {
    function balanceOf(address owner) external view returns (uint256);
}

contract HuntersRadar {
    struct Mint {
        address mintContract;
        string name;
        string infoUri; // URL info (situs/docs mint), boleh ""
        address submitter;
        uint64 submittedAt;
        int256 score; // upvotes - downvotes
        uint256 upvotes;
        uint256 downvotes;
        bool active;
    }

    address public immutable agentId;
    address public immutable owner;

    Mint[] private mints;
    mapping(address => bool) private submitted; // mintContract => already submitted
    mapping(uint256 => mapping(address => int8)) private votes; // mintId => voter => 0 none, 1 up, -1 down

    event MintSubmitted(
        uint256 indexed mintId, address indexed mintContract, address indexed submitter, string name
    );
    event Voted(uint256 indexed mintId, address indexed voter, bool up);
    event MintStatusChanged(uint256 indexed mintId, bool active);

    error NotAgentIdHolder();
    error NotOwner();
    error InvalidMintContract();
    error DuplicateMint();
    error InvalidMintId();
    error AlreadyVoted();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyAgentIdHolder() {
        if (!hasAgentId(msg.sender)) revert NotAgentIdHolder();
        _;
    }

    constructor(address _agentId, address _owner) {
        require(_agentId != address(0), "agentId zero");
        require(_owner != address(0), "owner zero");
        agentId = _agentId;
        owner = _owner;
    }

    /// @notice Submit a free mint to the radar. Caller must hold an Agent ID.
    function submitMint(address mintContract, string calldata name, string calldata infoUri)
        external
        onlyAgentIdHolder
        returns (uint256 mintId)
    {
        if (mintContract == address(0) || mintContract.code.length == 0) revert InvalidMintContract();
        if (submitted[mintContract]) revert DuplicateMint();

        submitted[mintContract] = true;
        mintId = mints.length;
        mints.push(
            Mint({
                mintContract: mintContract,
                name: name,
                infoUri: infoUri,
                submitter: msg.sender,
                submittedAt: uint64(block.timestamp),
                score: 0,
                upvotes: 0,
                downvotes: 0,
                active: true
            })
        );
        emit MintSubmitted(mintId, mintContract, msg.sender, name);
    }

    /// @notice Vote on a mint. One vote per address per mint; changing your
    ///         vote is allowed (score is adjusted). Voting the same way twice reverts.
    function vote(uint256 mintId, bool up) external onlyAgentIdHolder {
        if (mintId >= mints.length) revert InvalidMintId();
        int8 newVote = up ? int8(1) : int8(-1);
        int8 prev = votes[mintId][msg.sender];
        if (prev == newVote) revert AlreadyVoted();

        votes[mintId][msg.sender] = newVote;
        Mint storage m = mints[mintId];
        if (prev == 1) {
            m.upvotes -= 1;
            m.score -= 1;
        } else if (prev == -1) {
            m.downvotes -= 1;
            m.score += 1;
        }
        if (up) {
            m.upvotes += 1;
            m.score += 1;
        } else {
            m.downvotes += 1;
            m.score -= 1;
        }
        emit Voted(mintId, msg.sender, up);
    }

    /// @notice Toggle a mint's active flag (e.g. mint closed/ended). Owner only.
    function setActive(uint256 mintId, bool active) external onlyOwner {
        if (mintId >= mints.length) revert InvalidMintId();
        mints[mintId].active = active;
        emit MintStatusChanged(mintId, active);
    }

    function getMint(uint256 mintId) external view returns (Mint memory) {
        if (mintId >= mints.length) revert InvalidMintId();
        return mints[mintId];
    }

    function mintCount() external view returns (uint256) {
        return mints.length;
    }

    function hasAgentId(address who) public view returns (bool) {
        return IAgentId(agentId).balanceOf(who) > 0;
    }

    /// @notice 0 = no vote, 1 = upvote, -1 = downvote.
    function getVote(uint256 mintId, address voter) external view returns (int8) {
        if (mintId >= mints.length) revert InvalidMintId();
        return votes[mintId][voter];
    }
}
