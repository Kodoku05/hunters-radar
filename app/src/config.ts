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
// Registry MAINNET tayang 25 Nov 2026 via CREATE2
// (tx 0x8b3a8ca59c775b30d51bbce1d44ea74db17a7ef3c89967d3499df4ac984c94f1).
// Owner = wallet BAW Putra; agentId = Agent ID mainnet;
// mintCount awal 0 — terverifikasi on-chain setelah deploy.
// ============================================================
export const REGISTRY_ADDRESS = "0xdcce4c74a37fcb6a826523fd7ef32c1a45187bba";

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
  enabled: true,
};

// Chain yang dipakai dApp saat ini.
export const ACTIVE_CHAIN = BSC_MAINNET;

export const VERIFIED_JSON_URL = "./verified.json";
