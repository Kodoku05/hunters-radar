import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrowserProvider, Contract, JsonRpcProvider, isAddress } from "ethers";
import {
  ACTIVE_CHAIN,
  BSC_MAINNET,
  REGISTRY_ADDRESS,
  REGISTRY_CONFIGURED,
  VERIFIED_JSON_URL,
} from "./config";
import { REGISTRY_ABI, type OnChainMint } from "./abi";
import {
  STATUS_CLASS,
  STATUS_LABEL,
  type FeedItem,
  type VerifiedData,
  type VerifiedMint,
} from "./types";
import "./App.css";

type Filter = "all" | "open" | "closed" | "stalled";
type VoteState = 0 | 1 | -1;

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on?: (event: string, cb: (...a: unknown[]) => void) => void;
      removeListener?: (event: string, cb: (...a: unknown[]) => void) => void;
    };
  }
}

const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function statusOf(item: FeedItem): string {
  if (item.verifiedEntry) return item.verifiedEntry.status;
  if (item.active === false) return "closed";
  if (item.active === true) return "open";
  return "unverified";
}

function filterMatches(item: FeedItem, filter: Filter): boolean {
  if (filter === "all") return true;
  const s = statusOf(item);
  if (filter === "open") return s === "open" || s === "limited";
  if (filter === "closed") return s === "closed";
  if (filter === "stalled") return s === "stalled";
  return true;
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Jakarta",
    });
  } catch {
    return iso;
  }
}

function fmtTs(ts: number): string {
  return new Date(ts * 1000).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

export default function App() {
  const [verified, setVerified] = useState<VerifiedData | null>(null);
  const [verifiedError, setVerifiedError] = useState<string | null>(null);
  const [onChain, setOnChain] = useState<OnChainMint[] | null>(null);
  const [registryError, setRegistryError] = useState<string | null>(null);

  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [hasAgentId, setHasAgentId] = useState<boolean | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<FeedItem | null>(null);
  const [myVotes, setMyVotes] = useState<Record<number, VoteState>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [txMsg, setTxMsg] = useState<{ ok: boolean; text: string; hash?: string } | null>(null);

  // Form submit.
  const [formName, setFormName] = useState("");
  const [formContract, setFormContract] = useState("");
  const [formUri, setFormUri] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const readProviderRef = useRef<JsonRpcProvider | null>(null);
  if (!readProviderRef.current) {
    readProviderRef.current = new JsonRpcProvider(ACTIVE_CHAIN.rpcUrl);
  }

  // ---- Load verified.json (data seed terverifikasi) ----
  useEffect(() => {
    fetch(VERIFIED_JSON_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<VerifiedData>;
      })
      .then(setVerified)
      .catch((e) => setVerifiedError(`Gagal memuat verified.json: ${e.message}`));
  }, []);

  // ---- Baca registry on-chain (bila alamat sudah dikonfigurasi) ----
  const loadRegistry = useCallback(async () => {
    if (!REGISTRY_CONFIGURED) return;
    setRegistryError(null);
    try {
      const c = new Contract(
        REGISTRY_ADDRESS,
        REGISTRY_ABI,
        readProviderRef.current,
      );
      const count = Number(await c.mintCount());
      const list: OnChainMint[] = [];
      for (let i = 0; i < count; i++) {
        const m = await c.getMint(i);
        list.push({
          mintId: i,
          mintContract: m.mintContract as string,
          name: m.name as string,
          infoUri: m.infoUri as string,
          submitter: m.submitter as string,
          submittedAt: Number(m.submittedAt),
          score: Number(m.score),
          upvotes: Number(m.upvotes),
          downvotes: Number(m.downvotes),
          active: m.active as boolean,
        });
      }
      setOnChain(list);
    } catch (e) {
      setRegistryError(
        `Gagal membaca registry (${(e as Error).message}). Cek koneksi RPC ${ACTIVE_CHAIN.name}.`,
      );
    }
  }, []);

  useEffect(() => {
    void loadRegistry();
  }, [loadRegistry]);

  // ---- Wallet: deteksi akun yang sudah terhubung ----
  useEffect(() => {
    if (!window.ethereum) return;
    window.ethereum
      .request({ method: "eth_accounts" })
      .then((accs) => {
        const list = accs as string[];
        if (list.length > 0) setAccount(list[0]);
      })
      .catch(() => undefined);
    window.ethereum
      .request({ method: "eth_chainId" })
      .then((c) => setChainId(parseInt(c as string, 16)))
      .catch(() => undefined);
    const onAccounts = (accs: unknown) => {
      const list = accs as string[];
      setAccount(list.length > 0 ? list[0] : null);
    };
    const onChain = (c: unknown) => setChainId(parseInt(c as string, 16));
    window.ethereum.on?.("accountsChanged", onAccounts);
    window.ethereum.on?.("chainChanged", onChain);
    return () => {
      window.ethereum?.removeListener?.("accountsChanged", onAccounts);
      window.ethereum?.removeListener?.("chainChanged", onChain);
    };
  }, []);

  const connectWallet = async () => {
    if (!window.ethereum) {
      setWalletError("Wallet tidak ditemukan. Pasang dompet EVM (mis. MetaMask / Binance Wallet) lalu coba lagi.");
      return;
    }
    setConnecting(true);
    setWalletError(null);
    try {
      const accs = (await window.ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];
      setAccount(accs[0] ?? null);
      await switchToTestnet();
    } catch (e) {
      setWalletError(`Gagal menghubungkan wallet: ${(e as Error).message}`);
    } finally {
      setConnecting(false);
    }
  };

  const switchToTestnet = async () => {
    if (!window.ethereum) return;
    const hex = `0x${ACTIVE_CHAIN.chainId.toString(16)}`;
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: hex }],
      });
    } catch (e) {
      const err = e as { code?: number; message?: string };
      if (err.code === 4902) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: hex,
              chainName: ACTIVE_CHAIN.name,
              rpcUrls: [ACTIVE_CHAIN.rpcUrl],
              nativeCurrency: { name: "BNB", symbol: "tBNB", decimals: 18 },
              blockExplorerUrls: [ACTIVE_CHAIN.explorer],
            },
          ],
        });
      } else {
        throw e;
      }
    }
    setChainId(ACTIVE_CHAIN.chainId);
  };

  // ---- Pre-check Agent ID (UI saja; kontrak tetap penegak final) ----
  useEffect(() => {
    if (!REGISTRY_CONFIGURED || !account) {
      setHasAgentId(null);
      return;
    }
    const c = new Contract(
      REGISTRY_ADDRESS,
      REGISTRY_ABI,
      readProviderRef.current,
    );
    c.hasAgentId(account)
      .then((v: boolean) => setHasAgentId(v))
      .catch(() => setHasAgentId(null));
  }, [account]);

  // ---- Vote pengguna saat ini (getVote) ----
  useEffect(() => {
    if (!REGISTRY_CONFIGURED || !account || !onChain) return;
    const c = new Contract(
      REGISTRY_ADDRESS,
      REGISTRY_ABI,
      readProviderRef.current,
    );
    (async () => {
      const votes: Record<number, VoteState> = {};
      for (const m of onChain) {
        try {
          votes[m.mintId] = Number(await c.getVote(m.mintId, account)) as VoteState;
        } catch {
          votes[m.mintId] = 0;
        }
      }
      setMyVotes(votes);
    })();
  }, [account, onChain]);

  // ---- Gabungkan feed on-chain + seed ----
  const feed: FeedItem[] = useMemo(() => {
    const byContract = new Map<string, VerifiedMint>();
    for (const v of verified?.mints ?? []) {
      byContract.set(v.contract.toLowerCase(), v);
    }
    const items: FeedItem[] = [];
    const seen = new Set<string>();
    for (const m of onChain ?? []) {
      const v = byContract.get(m.mintContract.toLowerCase()) ?? null;
      seen.add(m.mintContract.toLowerCase());
      items.push({
        key: `chain-${m.mintId}`,
        name: m.name,
        contract: m.mintContract,
        chainId: ACTIVE_CHAIN.chainId,
        infoUri: m.infoUri,
        mintId: m.mintId,
        score: m.score,
        upvotes: m.upvotes,
        downvotes: m.downvotes,
        active: m.active,
        submitter: m.submitter,
        submittedAt: m.submittedAt,
        verifiedEntry: v,
        source: v ? "on-chain+seed" : "on-chain",
      });
    }
    for (const v of verified?.mints ?? []) {
      if (seen.has(v.contract.toLowerCase())) continue;
      items.push({
        key: `seed-${v.contract.toLowerCase()}`,
        name: v.name,
        contract: v.contract,
        chainId: v.chainId,
        infoUri: v.infoUri,
        mintId: null,
        score: null,
        upvotes: null,
        downvotes: null,
        active: null,
        submitter: null,
        submittedAt: null,
        verifiedEntry: v,
        source: "seed",
      });
    }
    // Urutkan: skor on-chain tertinggi dulu, lalu seed sesuai urutan verifier.
    items.sort((a, b) => (b.score ?? -1_000_000) - (a.score ?? -1_000_000));
    return items;
  }, [onChain, verified]);

  const visibleFeed = useMemo(() => {
    const q = query.trim().toLowerCase();
    return feed.filter(
      (it) =>
        filterMatches(it, filter) &&
        (q === "" ||
          it.name.toLowerCase().includes(q) ||
          it.contract.toLowerCase().includes(q)),
    );
  }, [feed, filter, query]);

  const counts = useMemo(() => {
    const c = { all: feed.length, open: 0, closed: 0, stalled: 0 };
    for (const it of feed) {
      const s = statusOf(it);
      if (s === "open" || s === "limited") c.open++;
      else if (s === "closed") c.closed++;
      else if (s === "stalled") c.stalled++;
    }
    return c;
  }, [feed]);

  const wrongChain = account !== null && chainId !== null && chainId !== ACTIVE_CHAIN.chainId;

  const signerContract = async () => {
    if (!window.ethereum) throw new Error("Wallet tidak tersedia.");
    const provider = new BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    return new Contract(REGISTRY_ADDRESS, REGISTRY_ABI, signer);
  };

  const doVote = async (item: FeedItem, up: boolean) => {
    if (item.mintId === null) return;
    if (!account || hasAgentId !== true) return;
    setBusy(`vote-${item.mintId}-${up ? "up" : "down"}`);
    setTxMsg(null);
    try {
      const c = await signerContract();
      const tx = await c.vote(item.mintId, up);
      setTxMsg({ ok: true, text: "Vote terkirim — menunggu konfirmasi…", hash: tx.hash });
      await tx.wait();
      setTxMsg({ ok: true, text: `Vote ${up ? "naik" : "turun"} tercatat di ${ACTIVE_CHAIN.name}.`, hash: tx.hash });
      await loadRegistry();
    } catch (e) {
      const msg = (e as Error).message ?? "";
      const friendly = msg.includes("AlreadyVoted")
        ? "Kamu sudah memberi vote yang sama untuk mint ini."
        : msg.includes("NotAgentIdHolder")
          ? "Kontrak menolak: wallet ini tidak memegang Agent ID."
          : `Vote gagal: ${msg}`;
      setTxMsg({ ok: false, text: friendly });
    } finally {
      setBusy(null);
    }
  };

  const doSubmit = async () => {
    setFormError(null);
    setTxMsg(null);
    if (!formName.trim()) return setFormError("Nama mint wajib diisi.");
    if (!isAddress(formContract.trim())) {
      return setFormError("Alamat kontrak tidak valid (harus alamat EVM 0x…).");
    }
    if (formUri.trim() && !/^https?:\/\//i.test(formUri.trim())) {
      return setFormError("URL info harus diawali http:// atau https:// (boleh dikosongkan).");
    }
    if (!account || hasAgentId !== true) return;
    setBusy("submit");
    try {
      const c = await signerContract();
      const tx = await c.submitMint(formContract.trim(), formName.trim(), formUri.trim());
      setTxMsg({ ok: true, text: "Submit terkirim — menunggu konfirmasi…", hash: tx.hash });
      await tx.wait();
      setTxMsg({ ok: true, text: "Mint berhasil ditambahkan ke Radar.", hash: tx.hash });
      setFormName("");
      setFormContract("");
      setFormUri("");
      await loadRegistry();
    } catch (e) {
      const msg = (e as Error).message ?? "";
      const friendly = msg.includes("DuplicateMint")
        ? "Kontrak ini sudah pernah di-submit ke Radar."
        : msg.includes("InvalidMintContract")
          ? "Kontrak menolak: alamat itu bukan kontrak (tidak ada bytecode)."
          : msg.includes("NotAgentIdHolder")
            ? "Kontrak menolak: wallet ini tidak memegang Agent ID."
            : `Submit gagal: ${msg}`;
      setTxMsg({ ok: false, text: friendly });
    } finally {
      setBusy(null);
    }
  };

  const submitDisabledReason: string | null = !REGISTRY_CONFIGURED
    ? "Interaksi on-chain belum aktif: testnet live tertunda (faucet), deploy mainnet 25–26 Nov 2026."
    : !account
      ? "Hubungkan wallet dulu."
      : wrongChain
        ? `Pindah ke ${ACTIVE_CHAIN.name} dulu.`
        : hasAgentId === false
          ? "Wallet ini tidak memegang Agent ID — kontrak akan menolak submit (gate: balanceOf Agent ID > 0). Klaim Agent ID dulu, atau gunakan wallet yang sudah punya."
          : hasAgentId === null
            ? "Memeriksa kepemilikan Agent ID…"
            : null;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">◉</span>
          <div>
            <h1>Hunter&rsquo;s Radar</h1>
            <p>Feed free-mint terverifikasi on-chain — untuk pemegang Agent ID</p>
          </div>
        </div>
        <div className="wallet-box">
          <span className={`chain-badge ${wrongChain ? "chain-wrong" : ""}`}>
            {ACTIVE_CHAIN.name} · {wrongChain ? "chain salah" : "aktif"}
          </span>
          {account ? (
            <span className="account">
              {shortAddr(account)}
              {hasAgentId === true && <span className="agent-badge">Agent ID ✓</span>}
              {hasAgentId === false && <span className="agent-badge no">tanpa Agent ID</span>}
            </span>
          ) : (
            <button className="btn primary" onClick={connectWallet} disabled={connecting}>
              {connecting ? "Menghubungkan…" : "Hubungkan Wallet"}
            </button>
          )}
        </div>
      </header>

      {walletError && <div className="alert error">{walletError}</div>}
      {wrongChain && account && (
        <div className="alert warn">
          Wallet berada di chain lain. Hunter&rsquo;s Radar Tahap 1 berjalan di{" "}
          <strong>{ACTIVE_CHAIN.name}</strong>.{" "}
          <button className="btn small" onClick={() => void switchToTestnet()}>
            Pindah ke {ACTIVE_CHAIN.name}
          </button>
        </div>
      )}

      {!REGISTRY_CONFIGURED && (
        <div className="alert info">
          <strong>Mode seed-only — interaksi on-chain belum aktif.</strong> Kontrak registry
          sudah lolos uji lokal lengkap (23 tes + E2E 15/15), tetapi deploy ke testnet live
          tertunda: faucet BSC testnet mensyaratkan saldo mainnet yang tidak kami miliki.
          Deploy mainnet dijadwalkan <strong>25–26 Nov 2026</strong> — submit &amp; vote aktif
          begitu kontrak mainnet tayang. Feed di bawah menampilkan data seed terverifikasi
          (10 mint).
        </div>
      )}
      {REGISTRY_CONFIGURED && registryError && <div className="alert error">{registryError}</div>}
      {verifiedError && <div className="alert error">{verifiedError}</div>}

      {txMsg && (
        <div className={`alert ${txMsg.ok ? "ok" : "error"}`}>
          {txMsg.text}{" "}
          {txMsg.hash && (
            <a href={ACTIVE_CHAIN.explorerTx(txMsg.hash)} target="_blank" rel="noreferrer">
              Lihat tx ↗
            </a>
          )}
        </div>
      )}

      <main>
        <section className="feed-panel">
          <div className="feed-head">
            <h2>Feed Mint</h2>
            <span className="feed-meta">
              {verified
                ? `Verifikasi terakhir ${fmtDate(verified.generatedAt)} (blok ${verified.blockNumber.toLocaleString("id-ID")})`
                : "Memuat data verifikasi…"}
            </span>
          </div>

          <div className="controls">
            <div className="filters" role="tablist" aria-label="Filter status">
              {(
                [
                  ["all", `Semua (${counts.all})`],
                  ["open", `Buka (${counts.open})`],
                  ["closed", `Tutup (${counts.closed})`],
                  ["stalled", `Terhenti (${counts.stalled})`],
                ] as [Filter, string][]
              ).map(([f, label]) => (
                <button
                  key={f}
                  className={`filter-btn ${filter === f ? "active" : ""}`}
                  onClick={() => setFilter(f)}
                >
                  {label}
                </button>
              ))}
            </div>
            <input
              className="search"
              type="search"
              placeholder="Cari nama / alamat kontrak…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          {visibleFeed.length === 0 ? (
            <div className="empty">
              {feed.length === 0
                ? "Belum ada mint di feed. Muat ulang halaman, atau submit mint pertama begitu registry aktif."
                : "Tidak ada mint yang cocok dengan filter / pencarian ini."}
            </div>
          ) : (
            <ul className="feed-list">
              {visibleFeed.map((item) => {
                const st = statusOf(item);
                const v = item.verifiedEntry;
                const myVote = item.mintId !== null ? (myVotes[item.mintId] ?? 0) : 0;
                return (
                  <li key={item.key} className="card">
                    <div className="card-top">
                      <div className="card-title">
                        <h3>{item.name}</h3>
                        <span className={`status-badge ${STATUS_CLASS[st as keyof typeof STATUS_CLASS] ?? "status-unverified"}`}>
                          {STATUS_LABEL[st as keyof typeof STATUS_LABEL] ?? st}
                        </span>
                        <span className="source-badge">
                          {item.source === "seed" ? "Seed terverifikasi" : "On-chain"}
                        </span>
                      </div>
                      {item.score !== null && (
                        <div className="score" title={`${item.upvotes} naik · ${item.downvotes} turun`}>
                          <span className="score-num">{item.score > 0 ? `+${item.score}` : item.score}</span>
                          <span className="score-label">skor</span>
                        </div>
                      )}
                    </div>

                    <p className="contract-line">
                      <code>{item.contract}</code>{" "}
                      <a
                        href={(item.chainId === 56 ? BSC_MAINNET : ACTIVE_CHAIN).explorerAddress(item.contract)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        BscScan ↗
                      </a>
                      {item.infoUri && (
                        <>
                          {" · "}
                          <a href={item.infoUri} target="_blank" rel="noreferrer">
                            Situs mint ↗
                          </a>
                        </>
                      )}
                    </p>

                    {v ? (
                      <p className="verify-line">
                        {v.verified ? "✓ Kontrak terkonfirmasi ada di BSC mainnet" : "⚠ Cek verifikasi gagal — lihat detail"}
                        {v.facts.totalSupply ? ` · totalSupply ${Number(v.facts.totalSupply).toLocaleString("id-ID")}` : ""}
                        {v.facts.maxSupply ? ` / max ${Number(v.facts.maxSupply).toLocaleString("id-ID")}` : ""}
                        {" · "}
                        <span className="muted">dicek {fmtDate(v.checkedAt)}</span>
                      </p>
                    ) : (
                      <p className="verify-line muted">
                        Belum pernah dicek verifier off-chain — status dari registry saja.
                      </p>
                    )}

                    {v?.priceNote && <p className="price-note">{v.priceNote}</p>}

                    <div className="card-actions">
                      <button className="btn ghost" onClick={() => setSelected(item)}>
                        Detail
                      </button>
                      {item.mintId !== null && (
                        <div className="vote-box">
                          <button
                            className={`btn vote ${myVote === 1 ? "voted-up" : ""}`}
                            disabled={!account || hasAgentId !== true || busy !== null}
                            onClick={() => void doVote(item, true)}
                            title={
                              hasAgentId === false
                                ? "Butuh Agent ID untuk vote"
                                : myVote === 1
                                  ? "Kamu sudah vote naik"
                                  : "Vote naik"
                            }
                          >
                            ▲ {item.upvotes ?? 0}
                          </button>
                          <button
                            className={`btn vote ${myVote === -1 ? "voted-down" : ""}`}
                            disabled={!account || hasAgentId !== true || busy !== null}
                            onClick={() => void doVote(item, false)}
                            title={
                              hasAgentId === false
                                ? "Butuh Agent ID untuk vote"
                                : myVote === -1
                                  ? "Kamu sudah vote turun"
                                  : "Vote turun"
                            }
                          >
                            ▼ {item.downvotes ?? 0}
                          </button>
                          {myVote !== 0 && (
                            <span className="my-vote">Vote kamu: {myVote === 1 ? "naik" : "turun"}</span>
                          )}
                        </div>
                      )}
                    </div>
                    {busy?.startsWith(`vote-${item.mintId}`) && (
                      <p className="muted">Mengirim vote…</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <aside className="side">
          <section className="submit-panel">
            <h2>Submit Mint Baru</h2>
            <p className="muted small">
              Hanya pemegang Agent ID yang bisa submit — kontrak memeriksa{" "}
              <code>balanceOf</code> Agent ID dan menolak wallet tanpa Agent ID. Submit tidak
              dipungut biaya selain gas.
            </p>
            <label>
              Nama mint
              <input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="mis. PXIO NFT"
                disabled={submitDisabledReason !== null}
              />
            </label>
            <label>
              Alamat kontrak mint
              <input
                value={formContract}
                onChange={(e) => setFormContract(e.target.value)}
                placeholder="0x…"
                disabled={submitDisabledReason !== null}
              />
            </label>
            <label>
              URL info <span className="muted">(opsional)</span>
              <input
                value={formUri}
                onChange={(e) => setFormUri(e.target.value)}
                placeholder="https://…"
                disabled={submitDisabledReason !== null}
              />
            </label>
            {formError && <p className="form-error">{formError}</p>}
            {submitDisabledReason && (
              <p className="disabled-reason">{submitDisabledReason}</p>
            )}
            <button
              className="btn primary full"
              onClick={() => void doSubmit()}
              disabled={submitDisabledReason !== null || busy === "submit"}
            >
              {busy === "submit" ? "Mengirim…" : "Submit ke Radar"}
            </button>
            <p className="muted small">
              Kontrak menolak alamat yang bukan kontrak dan mint yang sudah pernah di-submit.
            </p>
          </section>

          <section className="about-panel">
            <h2>Cara kerja verifikasi</h2>
            <p className="small">
              Verifier off-chain memeriksa tiap kontrak via RPC BSC mainnet (read-only): ada
              tidaknya bytecode, <code>totalSupply</code>/<code>maxSupply</code> bila tersedia,
              dan respons getter harga umum. Status buka/tutup adalah kurasi dari riwayat
              verifikasi on-chain — dasarnya tertulis di tiap detail mint.
            </p>
            <p className="small">
              Registry on-chain hanya menyimpan daftar + vote. Harga/kuota TIDAK diputuskan
              kontrak — selalu periksa sendiri sebelum mint.
            </p>
            <p className="small">
              Registry:{" "}
              {REGISTRY_CONFIGURED ? (
                <a
                  href={ACTIVE_CHAIN.explorerAddress(REGISTRY_ADDRESS)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <code>{shortAddr(REGISTRY_ADDRESS)}</code> ↗
                </a>
              ) : (
                <span className="muted">belum di-deploy (testnet live tertunda — mainnet 25–26 Nov)</span>
              )}
            </p>
          </section>
        </aside>
      </main>

      <footer>
        <p>
          <strong>Disclaimer:</strong> verifikasi di halaman ini adalah fakta on-chain pada
          waktu cek — bukan nasihat finansial. Kondisi mint bisa berubah sewaktu-waktu; selalu
          DYOR dan periksa kontrak sendiri sebelum berinteraksi. Hunter&rsquo;s Radar tidak
          menjanjikan keuntungan, nilai, atau hasil apa pun.
        </p>
        <p className="muted small">
          Dibangun untuk Binance Agent ID Hackathon (Nov–Des 2026). Proyek komunitas independen
          — bukan produk resmi Binance. Data seed: diverifikasi on-chain oleh Muse, Okt–Nov 2026.
        </p>
      </footer>

      {selected && (
        <DetailModal item={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function DetailModal({ item, onClose }: { item: FeedItem; onClose: () => void }) {
  const v = item.verifiedEntry;
  const st = statusOf(item);
  const explorer = item.chainId === 56 ? BSC_MAINNET : ACTIVE_CHAIN;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Tutup">
          ✕
        </button>
        <h2>{item.name}</h2>
        <p>
          <span className={`status-badge ${STATUS_CLASS[st as keyof typeof STATUS_CLASS] ?? "status-unverified"}`}>
            {STATUS_LABEL[st as keyof typeof STATUS_LABEL] ?? st}
          </span>{" "}
          <span className="source-badge">
            {item.source === "seed" ? "Seed terverifikasi" : "On-chain registry"}
          </span>
        </p>

        <dl className="detail-list">
          <dt>Kontrak</dt>
          <dd>
            <code>{item.contract}</code>{" "}
            <a href={explorer.explorerAddress(item.contract)} target="_blank" rel="noreferrer">
              BscScan ↗
            </a>
          </dd>
          {item.infoUri && (
            <>
              <dt>Situs / info</dt>
              <dd>
                <a href={item.infoUri} target="_blank" rel="noreferrer">
                  {item.infoUri} ↗
                </a>
              </dd>
            </>
          )}
          {item.mintId !== null && (
            <>
              <dt>Registry</dt>
              <dd>
                Mint #{item.mintId} · skor {item.score} ({item.upvotes} naik / {item.downvotes}{" "}
                turun) · {item.active ? "aktif" : "nonaktif"} · disubmit oleh{" "}
                <code>{shortAddr(item.submitter ?? "")}</code>
                {item.submittedAt ? ` · ${fmtTs(item.submittedAt)}` : ""}
              </dd>
            </>
          )}
          {v && (
            <>
              <dt>Status — dasarnya</dt>
              <dd>{v.statusBasis}</dd>
              <dt>Harga / biaya</dt>
              <dd>{v.priceNote}</dd>
              <dt>Catatan</dt>
              <dd>{v.notes}</dd>
              <dt>Sumber</dt>
              <dd>{v.source}</dd>
              <dt>Cek on-chain terakhir</dt>
              <dd>
                {fmtDate(v.checkedAt)} · blok {v.blockNumber.toLocaleString("id-ID")} · via{" "}
                {v.rpc}
                <br />
                <span className="muted small">{v.verificationSummary}</span>
              </dd>
            </>
          )}
        </dl>

        {v && (
          <>
            <h3>Fakta on-chain (run terakhir)</h3>
            <ul className="facts">
              {Object.entries(v.facts).length === 0 && (
                <li className="muted">Tidak ada fakta standar yang terbaca (kontrak non-standar / sale contract).</li>
              )}
              {Object.entries(v.facts).map(([k, val]) => (
                <li key={k}>
                  <code>{k}</code>:{" "}
                  {Array.isArray(val) ? val.join("; ") : val}
                </li>
              ))}
            </ul>
            <h3>Cek yang dilakukan</h3>
            <ul className="checks">
              {v.checks.map((c) => (
                <li key={c.check} className={c.ok === true ? "ok" : c.ok === false ? "fail" : "na"}>
                  <span className="check-icon">
                    {c.ok === true ? "✓" : c.ok === false ? "✗" : "–"}
                  </span>
                  <span>
                    <code>{c.check}</code> — {c.detail}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
        {!v && (
          <p className="muted">
            Mint ini belum pernah dicek verifier off-chain. Status di atas berasal dari registry
            saja — periksa kontrak sendiri sebelum berinteraksi.
          </p>
        )}
      </div>
    </div>
  );
}
