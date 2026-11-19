// ABI HuntersRadar — HARUS cocok persis dengan
// ../build/INTERFACE.md (FROZEN). Jangan ubah tanpa izin koordinator.
export const REGISTRY_ABI = [
  "constructor(address _agentId)",
  "function submitMint(address mintContract, string name, string infoUri) returns (uint256 mintId)",
  "function vote(uint256 mintId, bool up)",
  "function setActive(uint256 mintId, bool active)",
  "function getMint(uint256 mintId) view returns (tuple(address mintContract, string name, string infoUri, address submitter, uint64 submittedAt, int256 score, uint256 upvotes, uint256 downvotes, bool active))",
  "function mintCount() view returns (uint256)",
  "function hasAgentId(address who) view returns (bool)",
  "function getVote(uint256 mintId, address voter) view returns (int8)",
  "function agentId() view returns (address)",
  "function owner() view returns (address)",
  "event MintSubmitted(uint256 indexed mintId, address indexed mintContract, address indexed submitter, string name)",
  "event Voted(uint256 indexed mintId, address indexed voter, bool up)",
  "event MintStatusChanged(uint256 indexed mintId, bool active)",
] as const;

export interface OnChainMint {
  mintId: number;
  mintContract: string;
  name: string;
  infoUri: string;
  submitter: string;
  submittedAt: number;
  score: number;
  upvotes: number;
  downvotes: number;
  active: boolean;
}
