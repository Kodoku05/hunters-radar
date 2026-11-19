# Hunter's Radar

A verified free-mint discovery feed for **Binance Agent ID** holders — built for the
[Binance Agent ID Hackathon](https://www.binance.com/en/support/announcement/detail/95f5dbe0ea674a48a739b59e046648bf)
(Nov–Dec 2026).

**The problem:** Agent ID holders hunt free mints across dozens of projects, but there is
no single live feed of *what is open right now* — and no quick way to tell a real free
mint from a trap. **Hunter's Radar** is a community registry where holders submit new
free mints and upvote/downvote them, so the feed surfaces what is actually live and
trusted.

**No fees. No token. No upgradeability.** The contract only stores submissions and votes;
price/quota verification happens off-chain.

## How the Agent ID gate works

Every write function (`submitMint`, `vote`) checks the caller against the Agent ID
contract:

```solidity
IAgentId(agentId).balanceOf(msg.sender) > 0
```

Only addresses holding at least one Agent ID can submit or vote. The Agent ID contract
address is an immutable constructor parameter:

- **Mainnet:** `0x60b9262456de011f7d15a54cdd8c48baaa8b022f` (SPACE ID, ERC-721, non-transferable)
- **Testnet:** `MockAgentId` (this repo, `src/MockAgentId.sol`) — a minimal ERC-721 with a
  public `mint()` for testing. **Testnet only — never deploy it to mainnet.**

Other rules:

- `mintContract` must be a real contract (`extcodesize > 0`) and cannot be submitted twice.
- One vote per address per mint; changing your vote is allowed (the score adjusts).
- `setActive` (mark a mint open/closed) is owner-only; the owner is the deployer.

## Contracts

| Contract | Purpose |
|---|---|
| `src/HuntersRadar.sol` | Registry: submit mints, vote, owner toggles `active` |
| `src/MockAgentId.sol` | **Testnet only** mock of the Agent ID contract |

Interface: `submitMint(address,string,string)`, `vote(uint256,bool)`,
`setActive(uint256,bool)`, `getMint(uint256)`, `mintCount()`,
`hasAgentId(address)`, `getVote(uint256,address)`.
Events: `MintSubmitted`, `Voted`, `MintStatusChanged`.

## Testnet deployment (BSC testnet, chain 97)

> Status: deploy pending — deployer wallet awaiting tBNB from the testnet faucet.
> Addresses will be listed here once deployed.

| Contract | Address | BscScan |
|---|---|---|
| HuntersRadar | *TBD* | *TBD* |
| MockAgentId | *TBD* | *TBD* |

## Run the tests

```bash
forge test
```

23 tests, all passing: holder-gate (submit + vote), duplicate rejection, non-contract
rejection, one-vote-per-address with vote flipping, owner-only `setActive`, and event
emission.

## Deploy

### Testnet

```bash
# 1. Fresh deployer wallet (key stays OUT of the repo)
cast wallet new --json > ../testnet-deployer.key && chmod 600 ../testnet-deployer.key
# 2. Fund it with tBNB: https://testnet.bnbchain.org/faucet-smart
# 3. Deploy + run the full end-to-end check
./script/e2e-testnet.sh
```

Or deploy only:

```bash
PRIVATE_KEY=$(jq -r .private_key ../testnet-deployer.key) \
  forge script script/Deploy.s.sol:Deploy \
  --rpc-url https://data-seed-prebsc-1-s1.binance.org:8545 --broadcast
```

### Mainnet (one-shot — do not run without explicit go-ahead)

```bash
forge script script/DeployMainnet.s.sol:DeployMainnet \
  --rpc-url https://bsc-dataseed.binance.org --broadcast
```

The mainnet constructor argument is the real Agent ID contract
`0x60b9262456de011f7d15a54cdd8c48baaa8b022f`. Gas at 0.05 gwei is roughly
0.000075 BNB for the deploy. There is no redeploy margin — testnet first, always.

## License

MIT
