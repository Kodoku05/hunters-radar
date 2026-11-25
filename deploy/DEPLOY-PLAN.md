# Deploy mainnet Hunter's Radar — jalur CREATE2 via BAW (disiapkan 25 Nov 2026 malam)

## Kenapa jalur ini
- BAW tidak punya perintah deploy; `contract-call preview` mewajibkan `--to`
  (EVM), jadi pembuatan kontrak langsung (to=null) tidak bisa lewat BAW.
- `script/DeployMainnet.s.sol` butuh `--private-key` — BAW tidak mengekspos key.
- Jalur: CREATE2 lewat deterministic deployment proxy
  `0x4e59b44847b379578588920cA78FbF26c0B4956C` (Arachnid). Proxy ini
  BELUM terverifikasi on-chain di BSC dari sini — verifikasi dulu
  (eth_getCode / preview simulasi) sebelum execute.
- Constructor diubah di cabang ini: `constructor(address _agentId, address _owner)`
  supaya owner tetap wallet BAW Putra, bukan proxy. Tes: 23/23 PASS (25 Nov malam).

## Parameter (sudah dihitung)
- Agent ID mainnet: 0x60b9262456de011f7d15a54cdd8c48baaa8b022f
- Owner: 0xeca57C162DDf52f24594A9c0F279CB0325Eea8E2 (BAW Putra)
- Salt: 0x93b70a3911dcb8ae705110a0e7dfefb3b624971f8cabac05109ac3473d5453bf (keccak "hunters-radar-v1")
- Initcode hash: 0x03e0743f6de34c34d02a97236e6189535956613ed00faca649d857e18345745b
- Alamat kontrak terprediksi: 0xdcce4c74a37fcb6a826523fd7ef32c1a45187bba
- Calldata deploy (salt+initcode): deploy/create2-calldata.txt
- Estimasi gas deploy: ~1,40 jt gas → 0,000070 BNB @0,05 gwei; 0,00014 @0,1; 0,00070 @0,5.
  Saldo BAW 25 Nov: 0,00123334 BNB → cukup sampai ~0,88 gwei. Cek gas price live dulu.
- devMode BAW aktif s.d. 30 Nov 2026 (syarat contract-call). Sesi BAW s.d. 27 Nov 11:38 WIB.

## Langkah eksekusi (agen utama, setelah konfirmasi Putra atas preview)
1. `baw wallet gas-price --json` (atau setara) — pastikan estimasi total < saldo, sisakan cadangan.
2. Preview:
   baw contract-call preview --binanceChainId 56 \
     --from 0xeca57C162DDf52f24594A9c0F279CB0325Eea8E2 \
     --to 0x4e59b44847b379578588920cA78FbF26c0B4956C \
     --value 0 --inputData $(cat deploy/create2-calldata.txt) --json
   Preview WAJIB bersih (simulasi sukses, tanpa risiko/authority change mencurigakan).
   Bila preview gagal karena proxy tidak ada di BSC → BERHENTI, jangan execute; laporkan.
3. Tampilkan preview ke Putra, minta konfirmasi eksplisit (alur external-sign).
4. `baw contract-call execute` dengan requestId dari preview.
5. Verifikasi on-chain: eth_getCode di alamat terprediksi tidak kosong;
   owner() == BAW; agentId() == kontrak Agent ID; mintCount() == 0.
6. Isi REGISTRY_ADDRESS di app/src/config.ts, rebuild, re-deploy gh-pages.
7. Verifikasi kontrak di BscScan (API key BscScan masih menunggu Putra, atau via web UI).
8. JANGAN PERNAH deploy MockAgentId ke mainnet.

## Sesudah deploy
- Distribusi 26 Nov–8 Des (Square + grup hunter). Kill-gate 29 Nov:
  <15 alamat Agent ID berinteraksi → hentikan distribusi.
- Submit form hackathon 8 Des; deadline 9 Des 15:00 WIB.
