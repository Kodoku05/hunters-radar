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

## Repository structure

```
src/              HuntersRadar + MockAgentId (Foundry)
script/           Deploy (testnet/mainnet) + end-to-end testnet script
test/             Foundry tests
app/              dApp (Vite + React + TypeScript + ethers v6)
verifier/         Off-chain verifier (read-only) + seed data
docs/             Render screenshot
```

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

## dApp (`app/`)

Vite + React + TypeScript + **ethers v6**, wallet via `window.ethereum`
(MetaMask / Binance Wallet). No wagmi/RainbowKit — chosen deliberately for a
light, reliable build. Active chain: **BSC testnet (97)**; BSC mainnet (56) is
defined in config but disabled until Phase 2.

Features: on-chain registry feed (`mintCount` + `getMint`), per-mint
verification status from `verified.json`, filters (all/open/closed/stalled) +
search, submit form (UI pre-checks `hasAgentId`; the contract is the final
enforcer), up/down votes (current user vote via `getVote`), per-mint detail
(verification + citations + BscScan links).

```bash
cd app
npm install
npm run dev      # dev server
npm run build    # static build -> app/dist/ (GitHub Pages ready)
npm run preview  # serve the build on :4173
```

The registry address lives in exactly one place: **`app/src/config.ts`**
(`REGISTRY_ADDRESS`). Until the testnet registry is deployed it is a
`0x0000…0000` placeholder and the dApp runs **seed-only**: the feed shows 10
verified seed mints from `verified.json`, and submit/vote are disabled with an
explanation. Fill in the real address and rebuild to activate the on-chain
feed, submit, and vote.

## Verifier (`verifier/`)

```bash
cd verifier
npm install
node check.mjs   # -> writes app/public/verified.json
```

Read-only via BSC mainnet RPC (no transactions, no gas). Per contract it
checks: bytecode exists (`eth_getCode`), `name()`/`symbol()`,
`totalSupply()`/`maxSupply()` when available, and responses from common price
getters — raw values recorded as-is, interpretation not verified. Open/closed/
stalled status is curation from on-chain verification history (see
`statusBasis` per entry in `verifier/seeds.json`), not a result of the run —
and `verified.json` states that explicitly. Re-run the verifier periodically
(or before a deploy) to keep `verified.json` fresh, then rebuild the dApp.

## Compliance

- No promised returns, profits, or future value — anywhere in the copy.
- Footer disclaimer: verification = on-chain facts at check time, not
  financial advice; always DYOR.
- No web Agentic Wallet QR login, no collection of seeds/keys/pairing codes,
  no fake/sybil interactions. The registry charges no fees and has no token.
- Independent community project — not an official Binance product.
- Do not deploy anything to mainnet from this repo without the coordinator's
  decision (Phase 2).

## License

MIT
