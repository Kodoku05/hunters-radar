# Hunter's Radar — Status

Terakhir diperbarui: **19 Nov 2026, 23:07 WIB** (Tahap 1 selesai).

## Tahap 1 — SELESAI (dengan E2E lokal, bukan testnet live)

| Komponen | Status | Bukti |
|---|---|---|
| Kontrak `HuntersRadar` + `MockAgentId` | ✅ Selesai | 23/23 tes Foundry lolos |
| E2E lokal (Anvil) | ✅ **15/15 PASS** | `script/e2e-local.sh`, log `docs/e2e-local-2026-11-19.log` |
| Verifier off-chain + seed (10 mint) | ✅ Selesai | `verifier/`, `app/public/verified.json` |
| dApp (Vite + React + ethers v6) | ✅ Build sukses | `app/`, live di GitHub Pages (seed-only) |
| Deploy BSC testnet live | ❌ **DIBLOKIR — faucet** | Lihat bawah |

### Hasil E2E lokal (19 Nov 2026, 16:06 UTC, Anvil)

Deploy MockAgentId + HuntersRadar (bytecode terverifikasi on-chain) →
mint test Agent ID ke wallet A & B → gate terbaca benar (A/B holder,
C bukan) → A submit mint, `mintCount` = 1 → vote naik A & B, B flip ke
turun, `getVote(B)` = −1 → **C (non-holder) DITOLAK submit + vote** →
**submit duplikat DITOLAK**. State akhir `getMint(0)`: skor 0 (1 naik /
1 turun), aktif. Semua 15 langkah PASS, 0 FAIL.

### Kenapa tidak ada kontrak testnet live

Faucet BSC testnet **menolak** klaim tBNB untuk deployer testnet
`0x1eb5645502AcE43cF7B37c09a5F4fA183E74C27D`: syarat faucet adalah alamat
yang sama harus punya **≥0,002 BNB di BSC Mainnet**. Total BNB tim hanya
±0,00159 di semua wallet — tidak ada alamat yang lolos gate ini.
**Jalur faucet DITUTUP — jangan coba klaim lagi, jangan minta siapa pun
mengirim BNB ke mana pun untuk keperluan ini.**

Konsekuensinya: `REGISTRY_ADDRESS` di dApp sengaja tetap `0x0` (tidak
diisi alamat palsu / alamat Anvil). dApp berjalan mode seed-only: feed
seed terverifikasi tampil, submit & vote nonaktif dengan penjelasan
jujur di banner.

## Tahap 2 — Deploy mainnet (25–26 Nov 2026)

- Deploy `HuntersRadar` saja ke BSC Mainnet dengan Agent ID asli
  `0x60b9262456de011f7d15a54cdd8c48baaa8b022f` (lihat
  `script/DeployMainnet.s.sol`). **JANGAN PERNAH deploy `MockAgentId`
  ke mainnet.**
- Kebutuhan: **re-pairing BAW Putra** (sesi BAW habis ±21 Nov 07:30 WIB)
  + jendela gas rendah. Gas deploy ±$0,045, sekali saja.
- Setelah deploy: verifikasi kontrak di BscScan, isi
  `REGISTRY_ADDRESS` di `app/src/config.ts`, rebuild, re-deploy dApp.
- Distribusi: 26 Nov – 8 Des 2026 (Square + grup hunter). Kill-gate
  29 Nov: <15 alamat Agent ID berinteraksi → hentikan distribusi.
- Submit form hackathon: 8 Des 2026. Deadline: 9 Des 2026, 15:00 WIB.

## dApp live

- GitHub Pages: https://kodoku05.github.io/hunters-radar/ (seed-only
  sampai registry mainnet tayang; deploy ulang tiap ada perubahan
  `app/` — build `app/dist` dipublikasi ke branch `gh-pages`).
