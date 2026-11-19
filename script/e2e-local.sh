#!/usr/bin/env bash
# End-to-end LOKAL Hunter's Radar melawan Anvil (Foundry, tanpa jaringan live).
#
# Dibuat 19 Nov 2026 setelah faucet BSC testnet menolak klaim tBNB:
# faucet mensyaratkan alamat yang sama punya >=0,002 BNB di BSC Mainnet,
# dan total BNB Putra hanya ~0,00159 di semua wallet — gate tidak bisa
# dipenuhi. Jalur testnet live DITUTUP; E2E lokal ini menggantikannya
# untuk Tahap 1. Deploy mainnet tetap dijadwalkan 25-26 Nov 2026.
#
# Alur identik dengan script/e2e-testnet.sh, hanya RPC-nya Anvil lokal:
#   deploy MockAgentId + HuntersRadar -> mint test Agent ID ke A dan B
#   (C tanpa ID) -> A submit mint -> vote naik/turun -> C (non-holder)
#   WAJIB ditolak submit + vote -> submit duplikat WAJIB ditolak.
#
# Deployer = akun Anvil #0 (kunci uji publik Foundry, TANPA nilai nyata —
# JANGAN PERNAH dipakai dengan dana sungguhan). Wallet uji A/B/C dibuat
# baru tiap run dan hanya hidup di Anvil lokal ini.
#
# Usage: ./script/e2e-local.sh
# Log lengkap: /tmp/hunters-e2e-local/e2e-local.log
set -uo pipefail

PORT="${ANVIL_PORT:-8545}"
RPC="http://127.0.0.1:$PORT"
WORKDIR="/tmp/hunters-e2e-local"
mkdir -p "$WORKDIR"
LOG="$WORKDIR/e2e-local.log"
: > "$LOG"
exec > >(tee -a "$LOG") 2>&1

export PATH="$HOME/.foundry/bin:$PATH"

# Deployer = akun Anvil #0. Kuncinya DIAMBIL DARI OUTPUT ANVIL SENDIRI
# (bukan hardcode — hardcode rawan typo satu karakter, yang pernah
# membuat deploy gagal "insufficient funds" karena alamatnya tak terdanai).
# Ini kunci uji publik Foundry, TANPA nilai nyata — JANGAN PERNAH dipakai
# dengan dana sungguhan.
DEPLOYER_KEY=""
DEPLOYER=""

PASS=0
FAIL=0
step_ok()   { echo "PASS: $1"; PASS=$((PASS+1)); }
step_fail() { echo "FAIL: $1"; FAIL=$((FAIL+1)); }

echo "=== Hunter's Radar E2E LOKAL — $(date -u '+%Y-%m-%d %H:%M UTC') ==="
echo "RPC: $RPC (Anvil lokal, tanpa jaringan live, tanpa tBNB)"

# --- 0. Start Anvil ---
echo "=== [0] Menyalakan Anvil ==="
anvil --port "$PORT" > "$WORKDIR/anvil.log" 2>&1 &
ANVIL_PID=$!
trap 'kill $ANVIL_PID 2>/dev/null || true' EXIT
for i in $(seq 1 30); do
  if cast block-number --rpc-url "$RPC" > /dev/null 2>&1; then break; fi
  sleep 0.5
done
cast block-number --rpc-url "$RPC" > /dev/null 2>&1 \
  && step_ok "Anvil jalan di $RPC (pid $ANVIL_PID)" \
  || { step_fail "Anvil tidak merespons"; exit 1; }
# Ambil akun + kunci #0 dari output Anvil, lalu verifikasi silang.
DEPLOYER=$(awk '/^Available Accounts/{f=1} f && /^\(0\)/{print $2; exit}' "$WORKDIR/anvil.log")
DEPLOYER_KEY=$(awk '/^Private Keys/{f=1} f && /^\(0\)/{print $2; exit}' "$WORKDIR/anvil.log")
DERIVED=$(cast wallet address --private-key "$DEPLOYER_KEY" 2>/dev/null)
echo "Deployer: $DEPLOYER"
echo "Balance: $(cast balance "$DEPLOYER" --rpc-url "$RPC") wei"
if [ -n "$DEPLOYER" ] && [ -n "$DEPLOYER_KEY" ] && [ "${DERIVED,,}" = "${DEPLOYER,,}" ]; then
  step_ok "Kunci deployer terverifikasi (alamat turunan cocok dengan akun Anvil #0)"
else
  step_fail "Kunci deployer tidak cocok dengan akun Anvil #0"; exit 1
fi

# --- 1. Deploy ---
echo "=== [1] Deploy MockAgentId + HuntersRadar ==="
PRIVATE_KEY="$DEPLOYER_KEY" forge script script/Deploy.s.sol:Deploy \
  --rpc-url "$RPC" --broadcast > "$WORKDIR/deploy.log" 2>&1
MOCK=$(grep -oE 'MockAgentId: 0x[0-9a-fA-F]{40}' "$WORKDIR/deploy.log" | awk '{print $2}')
RADAR=$(grep -oE 'HuntersRadar: 0x[0-9a-fA-F]{40}' "$WORKDIR/deploy.log" | awk '{print $2}')
echo "MockAgentId: $MOCK"
echo "HuntersRadar: $RADAR"
# Alamat dari log forge script bisa berasal dari SIMULASI saja — buktikan
# deploy benar-benar tayang dengan memeriksa bytecode on-chain.
if [ -n "$MOCK" ] && [ -n "$RADAR" ] \
   && [ "$(cast code "$MOCK" --rpc-url "$RPC")" != "0x" ] \
   && [ "$(cast code "$RADAR" --rpc-url "$RPC")" != "0x" ]; then
  step_ok "Deploy MockAgentId + HuntersRadar (bytecode terverifikasi on-chain)"
else
  step_fail "Deploy — lihat $WORKDIR/deploy.log"; cat "$WORKDIR/deploy.log"; exit 1
fi

# --- 2. Throwaway test wallets (Anvil lokal saja) ---
echo "=== [2] Membuat 3 wallet uji (A, B, C) ==="
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
step_ok "3 wallet uji dibuat + didanai 0,02 ETH lokal"

# --- 3. Mint test Agent IDs to A and B only ---
echo "=== [3] Mint test Agent ID ke A dan B (C tanpa ID) ==="
cast send "$MOCK" "mint(address)" "$A_ADDR" --private-key "$DEPLOYER_KEY" --rpc-url "$RPC" > /dev/null \
  && cast send "$MOCK" "mint(address)" "$B_ADDR" --private-key "$DEPLOYER_KEY" --rpc-url "$RPC" > /dev/null \
  && step_ok "Mint test Agent ID ke A dan B" || { step_fail "Mint test Agent ID"; exit 1; }
HA=$(cast call "$RADAR" "hasAgentId(address)" "$A_ADDR" --rpc-url "$RPC")
HB=$(cast call "$RADAR" "hasAgentId(address)" "$B_ADDR" --rpc-url "$RPC")
HC=$(cast call "$RADAR" "hasAgentId(address)" "$C_ADDR" --rpc-url "$RPC")
# cast call mengembalikan hex mentah — normalisasi ke desimal sebelum banding.
HAD=$(cast --to-dec "$HA"); HBD=$(cast --to-dec "$HB"); HCD=$(cast --to-dec "$HC")
echo "hasAgentId(A): $HAD (harap 1/true)"
echo "hasAgentId(B): $HBD (harap 1/true)"
echo "hasAgentId(C): $HCD (harap 0/false)"
[ "$HAD" = "1" ] && [ "$HBD" = "1" ] && [ "$HCD" = "0" ] \
  && step_ok "Gate Agent ID terbaca benar (A/B holder, C bukan)" \
  || step_fail "Gate Agent ID salah baca"

# --- 4. A submits a mint ---
echo "=== [4] A submit mint ==="
if cast send "$RADAR" "submitMint(address,string,string)" "$MOCK" "Test Mint E2E" "https://example.com" \
  --private-key "$A_KEY" --rpc-url "$RPC" > "$WORKDIR/submit.log" 2>&1; then
  step_ok "A submit mint"
else
  step_fail "A submit mint"; cat "$WORKDIR/submit.log"; exit 1
fi
MC=$(cast call "$RADAR" "mintCount()" --rpc-url "$RPC")
MCD=$(cast --to-dec "$MC")
echo "mintCount: $MCD (harap 1)"
[ "$MCD" = "1" ] && step_ok "mintCount = 1 setelah submit" || step_fail "mintCount != 1"

# --- 5. Voting: B up, A up, B flips to down ---
echo "=== [5] Vote ==="
cast send "$RADAR" "vote(uint256,bool)" 0 true --private-key "$B_KEY" --rpc-url "$RPC" > /dev/null \
  && step_ok "B vote naik" || step_fail "B vote naik"
cast send "$RADAR" "vote(uint256,bool)" 0 true --private-key "$A_KEY" --rpc-url "$RPC" > /dev/null \
  && step_ok "A vote naik" || step_fail "A vote naik"
cast send "$RADAR" "vote(uint256,bool)" 0 false --private-key "$B_KEY" --rpc-url "$RPC" > /dev/null \
  && step_ok "B balik ke vote turun" || step_fail "B balik ke vote turun"
VB=$(cast call "$RADAR" "getVote(uint256,address)" 0 "$B_ADDR" --rpc-url "$RPC")
# getVote mengembalikan int256: -1 = semua bit 1.
MINUS1="0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
echo "getVote(0,B): $VB (harap -1)"
[ "$VB" = "$MINUS1" ] && step_ok "getVote B = -1 setelah flip" || step_fail "getVote B != -1"

# --- 6. Non-holder C must be REJECTED (submit + vote) ---
echo "=== [6] Penolakan non-holder C (keduanya WAJIB gagal) ==="
if cast send "$RADAR" "submitMint(address,string,string)" "$RADAR" "Sybil Mint" "" \
    --private-key "$C_KEY" --rpc-url "$RPC" > "$WORKDIR/c-submit.log" 2>&1; then
  step_fail "C submit LOLOS — GATE RUSAK"
else
  step_ok "C submit ditolak (bukan holder Agent ID)"
fi
if cast send "$RADAR" "vote(uint256,bool)" 0 true \
    --private-key "$C_KEY" --rpc-url "$RPC" > "$WORKDIR/c-vote.log" 2>&1; then
  step_fail "C vote LOLOS — GATE RUSAK"
else
  step_ok "C vote ditolak (bukan holder Agent ID)"
fi

# --- 7. Duplicate submit must be REJECTED ---
echo "=== [7] Submit duplikat (WAJIB gagal) ==="
if cast send "$RADAR" "submitMint(address,string,string)" "$MOCK" "Dup" "" \
    --private-key "$B_KEY" --rpc-url "$RPC" > "$WORKDIR/dup.log" 2>&1; then
  step_fail "Submit duplikat LOLOS — DEDUP RUSAK"
else
  step_ok "Submit duplikat ditolak"
fi

# --- 8. Final state ---
echo "=== [8] State akhir ==="
cast call "$RADAR" "getMint(uint256)" 0 --rpc-url "$RPC"

echo "=== RINGKASAN E2E LOKAL ==="
echo "PASS: $PASS  FAIL: $FAIL"
echo "MockAgentId=$MOCK HuntersRadar=$RADAR (Anvil lokal, ephemeral)"
if [ "$FAIL" -eq 0 ]; then
  echo "E2E LOKAL PASSED ($PASS/$PASS langkah)."
  exit 0
else
  echo "E2E LOKAL GAGAL: $FAIL langkah fail."
  exit 1
fi
