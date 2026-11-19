// Hunter's Radar — konfigurasi dApp.
//
// ============================================================
// STATUS 19 Nov 2026 (Tahap 1): kontrak registry SUDAH lolos uji
// lengkap secara lokal (23 tes Foundry + E2E Anvil 15/15 PASS —
// lihat docs/e2e-local-2026-11-19.log). Deploy ke BSC TESTNET
// LIVE tertunda: faucet testnet mensyaratkan alamat deployer
// punya >=0,002 BNB di BSC Mainnet, dan syarat itu tidak bisa
// dipenuhi (total BNB tim di bawah ambang itu). Jalur faucet
// DITUTUP — jangan coba klaim lagi.
//
// REGISTRY_ADDRESS dibiarkan 0x0 dengan SENGAJA sampai deploy
// MAINNET 25–26 Nov 2026 (butuh re-pairing BAW). Jangan isi
// alamat palsu / alamat Anvil lokal: dApp berjalan dalam mode
// "seed-only" — feed menampilkan data terverifikasi
// (verified.json) dan form submit / vote nonaktif sampai
// registry mainnet benar-benar tayang.
// ============================================================
export const REGISTRY_ADDRESS = "0x0000000000000000000000000000000000000000";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
export const REGISTRY_CONFIGURED =
  REGISTRY_ADDRESS.toLowerCase() !== ZERO_ADDRESS;

// Kontrak Agent ID mainnet (SPACE ID, ERC-721, non-transferable).
export const AGENT_ID_MAINNET = "0x60b9262456de011f7d15a54cdd8c48baaa8b022f";

export interface ChainConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  explorer: string;
  explorerTx: (hash: string) => string;
  explorerAddress: (addr: string) => string;
  currency: string;
  enabled: boolean;
}

export const BSC_TESTNET: ChainConfig = {
  chainId: 97,
  name: "BSC Testnet",
  rpcUrl: "https://data-seed-prebsc-1-s1.binance.org:8545",
  explorer: "https://testnet.bscscan.com",
  explorerTx: (h) => `https://testnet.bscscan.com/tx/${h}`,
  explorerAddress: (a) => `https://testnet.bscscan.com/address/${a}`,
  currency: "tBNB",
  enabled: true, // Tahap 1: testnet aktif.
};

export const BSC_MAINNET: ChainConfig = {
  chainId: 56,
  name: "BSC Mainnet",
  rpcUrl: "https://bsc-dataseed.binance.org",
  explorer: "https://bscscan.com",
  explorerTx: (h) => `https://bscscan.com/tx/${h}`,
  explorerAddress: (a) => `https://bscscan.com/address/${a}`,
  currency: "BNB",
  // NONAKTIF sampai Tahap 2 (deploy mainnet + keputusan koordinator).
  enabled: false,
};

// Chain yang dipakai dApp saat ini.
export const ACTIVE_CHAIN = BSC_TESTNET;

export const VERIFIED_JSON_URL = "./verified.json";
