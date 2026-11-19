// Hunter's Radar — off-chain verifier (READ-ONLY, tanpa gas).
//
// Membaca verifier/seeds.json, memeriksa tiap kontrak via RPC BSC mainnet,
// dan menulis app/public/verified.json untuk dibaca dApp.
//
// YANG DICEK (dan hanya ini yang diklaim):
//   - kontrak punya bytecode (eth_getCode)
//   - name()/symbol() bila ada (untuk tampilan)
//   - totalSupply() bila ada (ERC-721/ERC-20 standar)
//   - maxSupply() bila ada
//   - price getter umum (price/mintPrice/cost/publicPrice) bila ada —
//     nilai mentah dicatat APA ADANYA; interpretasinya TIDAK diverifikasi.
// Status buka/tutup/terhenti adalah KURASI dari riwayat verifikasi Muse
// (seeds.json: statusBasis) — BUKAN hasil cek on-chain run ini, dan
// verified.json menyebut itu secara eksplisit per entri.
//
// TIDAK PERNAH: mengirim transaksi, memakai wallet/seed siapa pun,
// mengklaim harga/nilai yang tidak dicek.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pkg from "js-sha3";
const { keccak256 } = pkg;

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SEEDS_PATH = join(__dirname, "seeds.json");
const OUT_PATH = join(ROOT, "app", "public", "verified.json");

const RPCS = [
  "https://bsc-dataseed.binance.org",
  "https://bsc-dataseed1.bnbchain.org",
  "https://1rpc.io/bnb",
];
const CHAIN_ID = 56;
const UA = "Hunter's Radar verifier (read-only; Binance Agent ID Hackathon)";

const sel = (sig) => "0x" + keccak256(sig).slice(0, 8);
const TOTAL_SUPPLY = sel("totalSupply()");
const MAX_SUPPLY = sel("maxSupply()");
const NAME = sel("name()");
const SYMBOL = sel("symbol()");
const PRICE_PROBES = ["price()", "mintPrice()", "cost()", "publicPrice()"].map(
  (sig) => ({ sig, selector: sel(sig) }),
);

let rpcIndex = 0;

async function rpc(method, params) {
  let lastErr;
  for (let attempt = 0; attempt < RPCS.length; attempt++) {
    const url = RPCS[(rpcIndex + attempt) % RPCS.length];
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": UA,
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error.message || "RPC error");
      rpcIndex = (rpcIndex + attempt) % RPCS.length;
      return json.result;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

const ethCall = (to, data, block = "latest") =>
  rpc("eth_call", [{ to, data }, block]);

function decodeUint(hex) {
  if (!hex || hex === "0x" || hex.length < 66) return null;
  try {
    return BigInt(hex).toString();
  } catch {
    return null;
  }
}

// Decode ABI string return: offset(32B) + length(32B) + utf8 bytes.
function decodeString(hex) {
  if (!hex || hex === "0x" || hex.length < 130) return null;
  try {
    const body = hex.slice(2);
    const len = parseInt(body.slice(64, 128), 16);
    if (!Number.isFinite(len) || len > 1000) return null;
    const bytes = Buffer.from(body.slice(128, 128 + len * 2), "hex");
    const s = bytes.toString("utf8").replace(/\0/g, "");
    return /^[\x20-\x7E]{1,64}$/.test(s) ? s : null;
  } catch {
    return null;
  }
}

async function checkSeed(seed, blockNumber) {
  const { contract, standard } = seed;
  const checks = [];
  const facts = {};

  // 1. Bytecode ada?
  let code;
  try {
    code = await rpc("eth_getCode", [contract, "latest"]);
  } catch (e) {
    checks.push({
      check: "contract-exists",
      ok: false,
      detail: `Gagal membaca bytecode via RPC: ${e.message}`,
    });
    return { seed, checks, facts };
  }
  const hasCode = code && code !== "0x" && code.length > 2;
  checks.push({
    check: "contract-exists",
    ok: hasCode,
    detail: hasCode
      ? `Bytecode ditemukan (${(code.length - 2) / 2} byte).`
      : "TIDAK ada bytecode di alamat ini (bukan kontrak / alamat salah).",
  });
  if (!hasCode) return { seed, checks, facts };

  // 2. name()/symbol() — info tampilan, bukan bukti apa pun.
  for (const [label, selector] of [
    ["name", NAME],
    ["symbol", SYMBOL],
  ]) {
    try {
      const v = decodeString(await ethCall(contract, selector));
      if (v !== null) {
        facts[label] = v;
        checks.push({ check: label, ok: true, detail: `${label}() = "${v}"` });
      } else {
        checks.push({
          check: label,
          ok: null,
          detail: `${label}() tidak mengembalikan string standar (kontrak mungkin bukan ERC-721/20 standar).`,
        });
      }
    } catch {
      checks.push({
        check: label,
        ok: null,
        detail: `${label}() gagal/revert — tidak tersedia di kontrak ini.`,
      });
    }
  }

  // 3. totalSupply() — hanya untuk standar yang punya totalSupply() tanpa argumen.
  if (standard === "ERC-721" || standard === "ERC-20") {
    try {
      const v = decodeUint(await ethCall(contract, TOTAL_SUPPLY));
      if (v !== null) {
        facts.totalSupply = v;
        checks.push({
          check: "totalSupply",
          ok: true,
          detail: `totalSupply() = ${v} (blok ${blockNumber}).`,
        });
      } else {
        checks.push({
          check: "totalSupply",
          ok: null,
          detail: "totalSupply() tidak mengembalikan uint256 standar.",
        });
      }
    } catch {
      checks.push({
        check: "totalSupply",
        ok: null,
        detail: "totalSupply() gagal/revert — tidak tersedia di kontrak ini.",
      });
    }
  } else {
    checks.push({
      check: "totalSupply",
      ok: null,
      detail: `Dilewati — standar ${standard} tidak punya totalSupply() tanpa argumen.`,
    });
  }

  // 4. maxSupply() bila ada.
  try {
    const v = decodeUint(await ethCall(contract, MAX_SUPPLY));
    if (v !== null) {
      facts.maxSupply = v;
      checks.push({
        check: "maxSupply",
        ok: true,
        detail: `maxSupply() = ${v}.`,
      });
    } else {
      checks.push({
        check: "maxSupply",
        ok: null,
        detail: "maxSupply() tidak tersedia / tidak mengembalikan uint256.",
      });
    }
  } catch {
    checks.push({
      check: "maxSupply",
      ok: null,
      detail: "maxSupply() gagal/revert — tidak tersedia di kontrak ini.",
    });
  }

  // 5. Price getter umum — nilai mentah, interpretasi TIDAK diverifikasi.
  const priceFindings = [];
  for (const { sig, selector } of PRICE_PROBES) {
    try {
      const v = decodeUint(await ethCall(contract, selector));
      if (v !== null) priceFindings.push(`${sig} = ${v} (wei mentah)`);
    } catch {
      // revert = getter tidak ada; bukan kegagalan.
    }
  }
  if (priceFindings.length > 0) {
    facts.priceProbe = priceFindings;
    checks.push({
      check: "price-probe",
      ok: true,
      detail:
        `Getter harga merespons: ${priceFindings.join("; ")}. ` +
        "Nilai mentah ini DICATAT apa adanya — artinya (harga mint? biaya lain?) TIDAK diverifikasi dalam run ini.",
    });
  } else {
    checks.push({
      check: "price-probe",
      ok: null,
      detail:
        "Tidak ada getter harga standar (price/mintPrice/cost/publicPrice) yang merespons. " +
        "Harga mengacu pada catatan kurasi (priceNote) — BUKAN hasil cek on-chain run ini.",
    });
  }

  return { seed, checks, facts };
}

async function main() {
  const seedsDoc = JSON.parse(readFileSync(SEEDS_PATH, "utf8"));
  const blockHex = await rpc("eth_blockNumber", []);
  const blockNumber = parseInt(blockHex, 16);
  const checkedAt = new Date().toISOString();

  console.log(`Hunter's Radar verifier — blok BSC ${blockNumber}, ${checkedAt}`);
  const mints = [];
  for (const seed of seedsDoc.seeds) {
    const { checks, facts } = await checkSeed(seed, blockNumber);
    const failed = checks.filter((c) => c.ok === false);
    mints.push({
      name: seed.name,
      contract: seed.contract,
      chainId: seed.chainId,
      standard: seed.standard,
      infoUri: seed.infoUri || "",
      status: seed.status,
      statusBasis: seed.statusBasis,
      priceNote: seed.priceNote,
      notes: seed.notes,
      source: seedsDoc.source,
      checkedAt,
      blockNumber,
      rpc: RPCS[rpcIndex],
      facts,
      checks,
      verified: failed.length === 0,
      verificationSummary:
        failed.length === 0
          ? "Kontrak terkonfirmasi ada di BSC mainnet pada blok cek; detail per cek lihat 'checks'. " +
            "Status buka/tutup adalah kurasi dari riwayat verifikasi Muse (lihat statusBasis), bukan hasil cek on-chain run ini."
          : "CEK GAGAL: " + failed.map((f) => f.detail).join(" "),
    });
    const codeCheck = checks.find((c) => c.check === "contract-exists");
    console.log(
      `  ${seed.name}: code=${codeCheck.ok ? "OK" : "FAIL"} totalSupply=${
        facts.totalSupply ?? "-"
      } status=${seed.status}`,
    );
  }

  const out = {
    generatedAt: checkedAt,
    blockNumber,
    chainId: CHAIN_ID,
    method:
      "READ-ONLY via RPC BSC mainnet (eth_getCode + eth_call). Tanpa transaksi, tanpa gas. " +
      "Yang diverifikasi on-chain per run: keberadaan bytecode kontrak, name/symbol, totalSupply/maxSupply bila tersedia, dan respons getter harga umum. " +
      "Status buka/tutup/terhenti dan catatan harga adalah KURASI dari riwayat verifikasi Muse Okt-Nov 2026 (lihat statusBasis/priceNote per entri), bukan hasil cek on-chain run ini.",
    disclaimer:
      "Verifikasi = fakta on-chain pada waktu cek. Bukan nasihat finansial. Selalu DYOR — kondisi mint bisa berubah sewaktu-waktu.",
    source: seedsDoc.source,
    mints,
  };

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + "\n");
  console.log(`\nWrote ${OUT_PATH} (${mints.length} mints)`);
}

main().catch((e) => {
  console.error("Verifier gagal:", e);
  process.exit(1);
});
