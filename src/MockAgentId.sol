// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title MockAgentId
/// @notice TESTNET ONLY — minimal ERC-721 stand-in for the Binance Agent ID
///         contract, used to test the HuntersRadar holder gate on BSC testnet.
///         NEVER deploy to mainnet: on mainnet the gate must point at the real
///         Agent ID contract (0x60b9262456de011f7d15a54cdd8c48baaa8b022f).
/// @dev Public mint() exists purely for testing. Real Agent IDs are
///      non-transferable and 1-per-person; this mock is transferable and
///      mintable by anyone, which is fine for testnet only.
contract MockAgentId {
    string public name = "Mock Agent ID";
    string public symbol = "MOCKID";

    uint256 private _nextTokenId = 1;
    mapping(uint256 => address) private _owners;
    mapping(address => uint256) private _balances;
    mapping(uint256 => address) private _approvals;
    mapping(address => mapping(address => bool)) private _operatorApprovals;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);

    error NonexistentToken();
    error NotAuthorized();

    /// @notice Mint a test Agent ID to `to`. Anyone can call this (testnet only).
    function mint(address to) external returns (uint256 tokenId) {
        require(to != address(0), "mint to zero");
        tokenId = _nextTokenId++;
        _owners[tokenId] = to;
        _balances[to] += 1;
        emit Transfer(address(0), to, tokenId);
    }

    function balanceOf(address owner) external view returns (uint256) {
        require(owner != address(0), "balance of zero");
        return _balances[owner];
    }

    function ownerOf(uint256 tokenId) external view returns (address) {
        address owner = _owners[tokenId];
        if (owner == address(0)) revert NonexistentToken();
        return owner;
    }

    function approve(address to, uint256 tokenId) external {
        address owner = _owners[tokenId];
        if (owner == address(0)) revert NonexistentToken();
        if (msg.sender != owner && !_operatorApprovals[owner][msg.sender]) revert NotAuthorized();
        _approvals[tokenId] = to;
        emit Approval(owner, to, tokenId);
    }

    function getApproved(uint256 tokenId) external view returns (address) {
        if (_owners[tokenId] == address(0)) revert NonexistentToken();
        return _approvals[tokenId];
    }

    function setApprovalForAll(address operator, bool approved) external {
        _operatorApprovals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function isApprovedForAll(address owner, address operator) external view returns (bool) {
        return _operatorApprovals[owner][operator];
    }

    function transferFrom(address from, address to, uint256 tokenId) external {
        address owner = _owners[tokenId];
        if (owner == address(0)) revert NonexistentToken();
        if (owner != from) revert NotAuthorized();
        if (
            msg.sender != owner && _approvals[tokenId] != msg.sender
                && !_operatorApprovals[owner][msg.sender]
        ) revert NotAuthorized();
        require(to != address(0), "transfer to zero");
        _approvals[tokenId] = address(0);
        _balances[from] -= 1;
        _balances[to] += 1;
        _owners[tokenId] = to;
        emit Transfer(from, to, tokenId);
    }
}
