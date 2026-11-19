// Tipe data verified.json (dihasilkan verifier/check.mjs).
export type SeedStatus =
  | "open"
  | "limited"
  | "closed"
  | "stalled"
  | "unverified";

export interface VerificationCheck {
  check: string;
  ok: boolean | null;
  detail: string;
}

export interface VerifiedMint {
  name: string;
  contract: string;
  chainId: number;
  standard: string;
  infoUri: string;
  status: SeedStatus;
  statusBasis: string;
  priceNote: string;
  notes: string;
  source: string;
  checkedAt: string;
  blockNumber: number;
  rpc: string;
  facts: Record<string, string | string[]>;
  checks: VerificationCheck[];
  verified: boolean;
  verificationSummary: string;
}

export interface VerifiedData {
  generatedAt: string;
  blockNumber: number;
  chainId: number;
  method: string;
  disclaimer: string;
  source: string;
  mints: VerifiedMint[];
}

// Satu baris feed: entri on-chain dari registry, entri seed terverifikasi,
// atau keduanya (bila mint on-chain cocok dengan seed).
export interface FeedItem {
  key: string;
  name: string;
  contract: string;
  chainId: number;
  infoUri: string;
  // On-chain (registry) — null untuk entri seed-only.
  mintId: number | null;
  score: number | null;
  upvotes: number | null;
  downvotes: number | null;
  active: boolean | null;
  submitter: string | null;
  submittedAt: number | null;
  // Verifikasi off-chain — null bila kontrak belum pernah dicek verifier.
  verifiedEntry: VerifiedMint | null;
  source: "on-chain" | "seed" | "on-chain+seed";
}

export const STATUS_LABEL: Record<SeedStatus, string> = {
  open: "Buka",
  limited: "Buka (terbatas)",
  closed: "Tutup",
  stalled: "Terhenti",
  unverified: "Belum dicek ulang",
};

export const STATUS_CLASS: Record<SeedStatus, string> = {
  open: "status-open",
  limited: "status-limited",
  closed: "status-closed",
  stalled: "status-stalled",
  unverified: "status-unverified",
};
