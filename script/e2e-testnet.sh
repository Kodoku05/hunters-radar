#!/usr/bin/env bash
# End-to-end testnet check for Hunter's Radar (BSC testnet, chain 97).
# Deploys MockAgentId + HuntersRadar, mints test Agent IDs to 2 wallets,
# runs submit + vote flows, and verifies non-holders are REJECTED.
#
# Prerequisites:
#   - Deployer wallet funded with tBNB (claim at https://testnet.bnbchain.org/faucet-smart)
#   - Key file at ../testnet-deployer.key (cast wallet new --json format),
#     or set TESTNET_KEY_FILE. The key is NEVER printed.
#
# Usage: ./script/e2e-testnet.sh
set -uo pipefail

RPC="${BSC_TESTNET_RPC:-https://data-seed-prebsc-1-s1.binance.org:8545}"
KEY_FILE="${TESTNET_KEY_FILE:-$(dirname "$0")/../testnet-deployer.key}"
WORKDIR="/tmp/hunters-e2e"
mkdir -p "$WORKDIR"

export PATH="$HOME/.foundry/bin:$PATH"

DEPLOYER_KEY=$(jq -r 'if type == "array" then .[0].private_key else .private_key end' "$KEY_FILE")
DEPLOYER=$(jq -r 'if type == "array" then .[0].address else .address end' "$KEY_FILE")
echo "Deployer: $DEPLOYER"
echo "Balance: $(cast balance "$DEPLOYER" --rpc-url "$RPC") wei"

# --- 1. Deploy ---
echo "=== Deploying MockAgentId + HuntersRadar ==="
PRIVATE_KEY="$DEPLOYER_KEY" forge script script/Deploy.s.sol:Deploy \
  --rpc-url "$RPC" --broadcast > "$WORKDIR/deploy.log" 2>&1
MOCK=$(grep -oE 'MockAgentId: 0x[0-9a-fA-F]{40}' "$WORKDIR/deploy.log" | awk '{print $2}')
RADAR=$(grep -oE 'HuntersRadar: 0x[0-9a-fA-F]{40}' "$WORKDIR/deploy.log" | awk '{print $2}')
echo "MockAgentId: $MOCK"
echo "HuntersRadar: $RADAR"
[ -n "$MOCK" ] && [ -n "$RADAR" ] || { echo "DEPLOY FAILED — see $WORKDIR/deploy.log"; exit 1; }

# --- 2. Throwaway test wallets (testnet only) ---
echo "=== Creating 3 test wallets ==="
for w in A B C; do
  cast wallet new --json > "$WORKDIR/wallet-$w.json"
  ADDR=$(jq -r 'if type == "array" then .[0].address else .address end' "$WORKDIR/wallet-$w.json")
  echo "Wallet $w: $ADDR"
  cast send "$ADDR" --value 0.02ether --private-key "$DEPLOYER_KEY" --rpc-url "$RPC" > /dev/null
done
A_ADDR=$(jq -r 'if type == "array" then .[0].address else .address end' "$WORKDIR/wallet-A.json")
B_ADDR=$(jq -r 'if type == "array" then .[0].address else .address end' "$WORKDIR/wallet-B.json")
C_ADDR=$(jq -r 'if type == "array" then .[0].address else .address end' "$WORKDIR/wallet-C.json")
A_KEY=$(jq -r 'if type == "array" then .[0].private_key else .private_key end' "$WORKDIR/wallet-A.json")
B_KEY=$(jq -r 'if type == "array" then .[0].private_key else .private_key end' "$WORKDIR/wallet-B.json")
C_KEY=$(jq -r 'if type == "array" then .[0].private_key else .private_key end' "$WORKDIR/wallet-C.json")

# --- 3. Mint test Agent IDs to A and B only ---
echo "=== Minting test Agent IDs to A and B (C gets none) ==="
cast send "$MOCK" "mint(address)" "$A_ADDR" --private-key "$DEPLOYER_KEY" --rpc-url "$RPC" > /dev/null
cast send "$MOCK" "mint(address)" "$B_ADDR" --private-key "$DEPLOYER_KEY" --rpc-url "$RPC" > /dev/null
echo "hasAgentId(A): $(cast call "$RADAR" "hasAgentId(address)" "$A_ADDR" --rpc-url "$RPC")"
echo "hasAgentId(B): $(cast call "$RADAR" "hasAgentId(address)" "$B_ADDR" --rpc-url "$RPC")"
echo "hasAgentId(C): $(cast call "$RADAR" "hasAgentId(address)" "$C_ADDR" --rpc-url "$RPC")"

# --- 4. A submits a mint (uses MockAgentId address as the sample mint contract) ---
echo "=== A submits a mint ==="
cast send "$RADAR" "submitMint(address,string,string)" "$MOCK" "Test Mint E2E" "https://example.com" \
  --private-key "$A_KEY" --rpc-url "$RPC" > "$WORKDIR/submit.log" 2>&1 && echo "submit: OK" || { echo "submit: FAILED"; cat "$WORKDIR/submit.log"; exit 1; }
echo "mintCount: $(cast call "$RADAR" "mintCount()" --rpc-url "$RPC")"

# --- 5. B votes up, A votes up, B flips to down ---
echo "=== Voting ==="
cast send "$RADAR" "vote(uint256,bool)" 0 true --private-key "$B_KEY" --rpc-url "$RPC" > /dev/null && echo "B upvote: OK"
cast send "$RADAR" "vote(uint256,bool)" 0 true --private-key "$A_KEY" --rpc-url "$RPC" > /dev/null && echo "A upvote: OK"
cast send "$RADAR" "vote(uint256,bool)" 0 false --private-key "$B_KEY" --rpc-url "$RPC" > /dev/null && echo "B flip to down: OK"
echo "getVote(0,B): $(cast call "$RADAR" "getVote(uint256,address)" 0 "$B_ADDR" --rpc-url "$RPC") (expect -1)"

# --- 6. Non-holder C must be REJECTED (submit + vote) ---
echo "=== Non-holder rejection checks (both MUST fail) ==="
if cast send "$RADAR" "submitMint(address,string,string)" "$RADAR" "Sybil Mint" "" \
    --private-key "$C_KEY" --rpc-url "$RPC" > "$WORKDIR/c-submit.log" 2>&1; then
  echo "!! C submit SUCCEEDED — GATE BROKEN"; exit 1
else
  echo "C submit rejected: OK"
fi
if cast send "$RADAR" "vote(uint256,bool)" 0 true \
    --private-key "$C_KEY" --rpc-url "$RPC" > "$WORKDIR/c-vote.log" 2>&1; then
  echo "!! C vote SUCCEEDED — GATE BROKEN"; exit 1
else
  echo "C vote rejected: OK"
fi

# --- 7. Duplicate submit must be REJECTED ---
echo "=== Duplicate submit check (MUST fail) ==="
if cast send "$RADAR" "submitMint(address,string,string)" "$MOCK" "Dup" "" \
    --private-key "$B_KEY" --rpc-url "$RPC" > "$WORKDIR/dup.log" 2>&1; then
  echo "!! Duplicate submit SUCCEEDED — DEDUP BROKEN"; exit 1
else
  echo "Duplicate submit rejected: OK"
fi

# --- 8. Final state ---
echo "=== Final state ==="
cast call "$RADAR" "getMint(uint256)" 0 --rpc-url "$RPC"
echo "E2E PASSED. MockAgentId=$MOCK HuntersRadar=$RADAR"
