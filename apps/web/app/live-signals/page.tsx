"use client";

import { useEffect, useMemo, useState } from "react";
import type { SignalRoomPayload } from "../../lib/signal-room/contracts";

type MarketType = "all" | "crypto" | "forex";

function SummaryCard({ label, value, tone = "text-slate-100" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-900/70 p-3 sm:p-4">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 text-lg font-semibold sm:text-xl ${tone}`}>{value}</p>
    </div>
  );
}

const tableWrapperClass = "overflow-x-auto rounded-md border border-slate-800/80";
const tableClass = "min-w-[1120px] w-full text-left text-sm";
const headerCellClass = "px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-300 bg-slate-950/70";
const textCellClass = "px-3 py-2 align-top text-slate-200";
const numericCellClass = "px-3 py-2 align-top text-right tabular-nums text-slate-100 whitespace-nowrap";

function formatMoney(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

function formatPrice(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 6, minimumFractionDigits: 2 });
}

function formatQty(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function formatIso(value: string | null) {
  if (!value) return "-";
  return new Date(value).toISOString().replace("T", " ").slice(0, 19);
}

function toneForPnl(value: number) {
  if (value > 0) return "text-emerald-300";
  if (value < 0) return "text-rose-300";
  return "text-slate-100";
}

function badgeClass(marketType: "crypto" | "forex") {
  return marketType === "crypto"
    ? "rounded bg-sky-900/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-200"
    : "rounded bg-amber-900/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200";
}

function scoreBadge(label: string, value: string) {
  return <span className="rounded bg-violet-900/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-200">{label}: {value}</span>;
}

export default function Page() {
  const [data, setData] = useState<SignalRoomPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resetBusy, setResetBusy] = useState(false);
  const [activeView, setActiveView] = useState<MarketType>("all");
  const [inspectorPositionId, setInspectorPositionId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const res = await fetch("/api/signal-room", { cache: "no-store" });
        if (!res.ok) {
          const payload = (await res.json().catch(() => null)) as { message?: string } | null;
          throw new Error(payload?.message ?? `Request failed (${res.status})`);
        }
        const payload = (await res.json()) as SignalRoomPayload;
        if (!mounted) return;
        setData(payload);
        setError(null);
      } catch (err: unknown) {
        if (!mounted) return;
        setData(null);
        setError(err instanceof Error ? err.message : "Unable to load signal room data");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void load();
    const timer = setInterval(() => {
      void load();
    }, 7000);

    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  async function runReset() {
    setResetBusy(true);
    try {
      const response = await fetch("/api/signal-room/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clearRecentSignals: false, clearRuntimeEvents: true })
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message ?? "Signal reset failed");
      }
      const refreshed = await fetch("/api/signal-room", { cache: "no-store" });
      if (refreshed.ok) {
        setData((await refreshed.json()) as SignalRoomPayload);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Signal reset failed");
    } finally {
      setResetBusy(false);
    }
  }

  const filtered = useMemo(() => {
    if (!data) {
      return {
        open: [],
        closed: [],
        selected: [],
        rejected: []
      };
    }

    if (activeView === "all") {
      return {
        open: data.openPaperPositions,
        closed: data.closedPaperPositions,
        selected: data.selectedThisCycle,
        rejected: data.rejectedThisCycle
      };
    }

    return {
      open: data.openPaperPositions.filter((position) => position.marketType === activeView),
      closed: data.closedPaperPositions.filter((position) => position.marketType === activeView),
      selected: data.selectedThisCycle.filter((entry) => entry.marketType === activeView),
      rejected: data.rejectedThisCycle.filter((entry) => entry.marketType === activeView)
    };
  }, [activeView, data]);

  const inspectorUniverse = useMemo(() => [...filtered.open, ...filtered.closed], [filtered.closed, filtered.open]);

  const inspected = useMemo(() => {
    const fallback = inspectorUniverse[0] ?? null;
    if (!inspectorPositionId) return fallback;
    return inspectorUniverse.find((position) => position.id === inspectorPositionId) ?? fallback;
  }, [inspectorPositionId, inspectorUniverse]);

  const inspectedLifecycle = useMemo(() => {
    if (!data || !inspected) return [];
    return data.recentPaperLifecycleEvents
      .filter((event) => (
        (event.signalTradeId === inspected.id || event.symbol === inspected.symbol)
        && (activeView === "all" || event.marketType === activeView)
      ))
      .slice(0, 8);
  }, [activeView, data, inspected]);

  return (
    <section className="space-y-4 sm:space-y-5">
      <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Signal Mode Demo Account</h1>
          <p className="mt-1 text-sm text-slate-400">Split crypto + forex signal surfaces with separate paper context summaries.</p>
        </div>
        <button
          className="rounded border border-rose-700/60 px-3 py-2 text-xs text-rose-200 hover:bg-rose-900/30 disabled:opacity-50"
          onClick={() => void runReset()}
          disabled={resetBusy}
        >
          {resetBusy ? "Resetting…" : "Reset signal-mode open state"}
        </button>
      </header>

      <nav className="flex flex-wrap gap-2">
        {(["all", "crypto", "forex"] as const).map((view) => (
          <button
            key={view}
            className={`rounded border px-3 py-1.5 text-xs uppercase tracking-wide ${activeView === view
              ? "border-sky-600 bg-sky-900/30 text-sky-100"
              : "border-slate-700 bg-slate-900/60 text-slate-300 hover:bg-slate-800/60"}`}
            onClick={() => setActiveView(view)}
          >
            {view}
          </button>
        ))}
      </nav>

      {loading && <p className="rounded border border-slate-800 bg-slate-900/70 p-3 text-sm text-slate-300">Loading signal room…</p>}
      {error && <p className="rounded border border-rose-700/50 bg-rose-900/20 p-3 text-sm text-rose-200">{error}</p>}

      {data && (
        <>
          {activeView === "all" ? (
            <section className="space-y-4">
              <h2 className="text-lg font-semibold text-slate-100">Account Summary — Split Contexts</h2>
              <div className="grid gap-4 xl:grid-cols-2">
                {(["crypto", "forex"] as const).map((marketType) => {
                  const account: any = marketType === "crypto"
                    ? data.cryptoAccount ?? data.marketContexts?.crypto.paperAccount
                    : data.forexAccount ?? data.marketContexts?.forex.paperAccount;
                  if (!account) return null;
                  return (
                    <div key={marketType} className="rounded-lg border border-slate-800 bg-slate-900/50 p-4 sm:p-5">
                      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-200">{marketType} paper summary</h3>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <SummaryCard label="Balance" value={formatMoney(account.balance)} />
                        <SummaryCard label="Equity" value={formatMoney(account.equity)} />
                        <SummaryCard label="Unrealized PnL" value={formatMoney(account.unrealizedPnL ?? account.unrealizedPnl)} tone={toneForPnl(account.unrealizedPnL ?? account.unrealizedPnl)} />
                        <SummaryCard label="Realized PnL" value={formatMoney(account.realizedPnL ?? account.realizedPnl)} tone={toneForPnl(account.realizedPnL ?? account.realizedPnl)} />
                        <SummaryCard label="Used Margin" value={formatMoney(account.usedMargin)} />
                        <SummaryCard label="Free Margin" value={formatMoney(account.freeMargin)} />
                        <SummaryCard label="Leverage" value={`${(account.leverage ?? account.configuredLeverage).toFixed(2)}x`} />
                        <SummaryCard label="Max Concurrent" value={String(account.maxConcurrentPositions ?? "-")} />
                        <SummaryCard label="Open Positions" value={String(account.openPositions ?? account.openPositionsCount)} />
                        <SummaryCard label="Closed Positions" value={String(account.closedPositions ?? account.closedPositionsCount)} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : (
            <section>
              <h2 className="mb-2 text-lg font-semibold text-slate-100">{activeView.toUpperCase()} Account Summary</h2>
              {(() => {
                const account: any = activeView === "crypto"
                  ? data.cryptoAccount ?? data.marketContexts?.crypto.paperAccount
                  : data.forexAccount ?? data.marketContexts?.forex.paperAccount;
                return (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <SummaryCard label="Balance" value={formatMoney(account?.balance ?? 0)} />
                <SummaryCard label="Equity" value={formatMoney(account?.equity ?? 0)} />
                <SummaryCard label="Unrealized PnL" value={formatMoney(account?.unrealizedPnL ?? account?.unrealizedPnl ?? 0)} tone={toneForPnl(account?.unrealizedPnL ?? account?.unrealizedPnl ?? 0)} />
                <SummaryCard label="Realized PnL" value={formatMoney(account?.realizedPnL ?? account?.realizedPnl ?? 0)} tone={toneForPnl(account?.realizedPnL ?? account?.realizedPnl ?? 0)} />
                <SummaryCard label="Used Margin" value={formatMoney(account?.usedMargin ?? 0)} />
                <SummaryCard label="Free Margin" value={formatMoney(account?.freeMargin ?? 0)} />
                <SummaryCard label="Leverage" value={`${(account?.leverage ?? account?.configuredLeverage ?? 0).toFixed(2)}x`} />
                <SummaryCard label="Max Concurrent" value={String(account?.maxConcurrentPositions ?? 0)} />
                <SummaryCard label="Open Positions" value={String(account?.openPositions ?? account?.openPositionsCount ?? 0)} />
                <SummaryCard label="Closed Positions" value={String(account?.closedPositions ?? account?.closedPositionsCount ?? 0)} />
              </div>
                );
              })()}
            </section>
          )}

          <section className="rounded-lg border border-sky-700/30 bg-sky-950/10 p-4 sm:p-5">
            <header className="mb-3">
              <h2 className="text-lg font-semibold">Open Positions</h2>
            </header>
            <div className={tableWrapperClass}>
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th className={headerCellClass}>Market</th>
                    <th className={headerCellClass}>Symbol</th>
                    <th className={headerCellClass}>Side</th>
                    <th className={headerCellClass}>Qty / Lot</th>
                    <th className={headerCellClass}>Entry</th>
                    <th className={headerCellClass}>Mark</th>
                    <th className={headerCellClass}>Stop</th>
                    <th className={headerCellClass}>TP1</th>
                    <th className={headerCellClass}>TP2</th>
                    <th className={headerCellClass}>Stop pips</th>
                    <th className={headerCellClass}>Risk %</th>
                    <th className={headerCellClass}>Exposure basis</th>
                    <th className={headerCellClass}>Notional</th>
                    <th className={headerCellClass}>Margin</th>
                    <th className={headerCellClass}>Unrealized</th>
                    <th className={headerCellClass}>Realized</th>
                    <th className={headerCellClass}>Engine / Strategy</th>
                    <th className={headerCellClass}>Why selected</th>
                    <th className={headerCellClass}>Opened</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.open.map((position) => (
                    <tr key={position.id} className="border-t border-sky-900/40">
                      <td className={textCellClass}><span className={badgeClass(position.marketType)}>{position.marketType}</span></td>
                      <td className={textCellClass}>{position.symbol}</td>
                      <td className={textCellClass}>{position.side}</td>
                      <td className={numericCellClass}>{formatQty(position.qty)}</td>
                      <td className={numericCellClass}>{formatPrice(position.entryPrice)}</td>
                      <td className={numericCellClass}>{formatPrice(position.markPrice)}</td>
                      <td className={numericCellClass}>{formatPrice(position.stopPrice)}</td>
                      <td className={numericCellClass}>{formatPrice(position.tp1Price)}</td>
                      <td className={numericCellClass}>{formatPrice(position.tp2Price)}</td>
                      <td className={numericCellClass}>{position.stopPips === null ? "-" : formatQty(position.stopPips)}</td>
                      <td className={numericCellClass}>{position.riskPct === null ? "-" : `${(position.riskPct * 100).toFixed(2)}%`}</td>
                      <td className={numericCellClass}>{position.exposureBasis === null ? "-" : formatMoney(position.exposureBasis)}</td>
                      <td className={numericCellClass}>{formatMoney(position.notional)}</td>
                      <td className={numericCellClass}>{formatMoney(position.marginUsed)}</td>
                      <td className={`${numericCellClass} ${toneForPnl(position.unrealizedPnl)}`}>{formatMoney(position.unrealizedPnl)}</td>
                      <td className={`${numericCellClass} ${toneForPnl(position.realizedPnl)}`}>{formatMoney(position.realizedPnl)}</td>
                      <td className={`${textCellClass} space-y-1`}>
                        <div className="text-xs text-slate-300">{position.engineLabel ?? "Engine 1"} ({position.engineId ?? "engine1"})</div>
                        <div className="font-medium">{position.strategyLabel ?? position.strategy ?? "-"}</div>
                        <div className="text-xs text-slate-400">strategyId: {position.strategy ?? "-"}</div>
                        <div className="flex flex-wrap gap-1">
                          {typeof position.signalScore === "number" && scoreBadge("score", position.signalScore.toFixed(1))}
                          {position.tier && scoreBadge("tier", position.tier)}
                          {typeof position.confidence === "number" && scoreBadge("conf", position.confidence.toFixed(2))}
                          {position.strategyVariant && scoreBadge("variant", position.strategyVariant)}
                          {position.setupType && scoreBadge("setup", position.setupType)}
                        </div>
                        <details className="text-xs text-slate-300">
                          <summary className="cursor-pointer text-slate-400">reasoning</summary>
                          <div className="mt-1 grid grid-cols-2 gap-1">
                            <span>trend: {position.reasoning?.trend ?? "-"}</span>
                            <span>structure: {position.reasoning?.structure ?? "-"}</span>
                            <span>volatility: {position.reasoning?.volatility ?? "-"}</span>
                            <span>entry: {position.reasoning?.entry ?? "-"}</span>
                          </div>
                        </details>
                      </td>
                      <td className={`${textCellClass} max-w-[260px] whitespace-normal break-words`}>{position.selectedReason ?? "-"}</td>
                      <td className={textCellClass}>{formatIso(position.openedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-lg border border-indigo-700/30 bg-indigo-950/10 p-4 sm:p-5">
            <h2 className="mb-3 text-lg font-semibold">Closed Positions</h2>
            <div className={tableWrapperClass}>
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th className={headerCellClass}>Market</th>
                    <th className={headerCellClass}>Symbol</th>
                    <th className={headerCellClass}>Side</th>
                    <th className={headerCellClass}>Entry</th>
                    <th className={headerCellClass}>Final Exit</th>
                    <th className={headerCellClass}>Stop pips</th>
                    <th className={headerCellClass}>Risk %</th>
                    <th className={headerCellClass}>Exposure basis</th>
                    <th className={headerCellClass}>Realized PnL</th>
                    <th className={headerCellClass}>Engine / Strategy</th>
                    <th className={headerCellClass}>Close reason</th>
                    <th className={headerCellClass}>Opened</th>
                    <th className={headerCellClass}>Closed</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.closed.map((position) => (
                    <tr key={position.id} className="border-t border-indigo-900/40">
                      <td className={textCellClass}><span className={badgeClass(position.marketType)}>{position.marketType}</span></td>
                      <td className={textCellClass}>{position.symbol}</td>
                      <td className={textCellClass}>{position.side}</td>
                      <td className={numericCellClass}>{formatPrice(position.entryPrice)}</td>
                      <td className={numericCellClass}>{formatPrice(position.markPrice)}</td>
                      <td className={numericCellClass}>{position.stopPips === null ? "-" : formatQty(position.stopPips)}</td>
                      <td className={numericCellClass}>{position.riskPct === null ? "-" : `${(position.riskPct * 100).toFixed(2)}%`}</td>
                      <td className={numericCellClass}>{position.exposureBasis === null ? "-" : formatMoney(position.exposureBasis)}</td>
                      <td className={`${numericCellClass} ${toneForPnl(position.realizedPnl)}`}>{formatMoney(position.realizedPnl)}</td>
                      <td className={`${textCellClass} space-y-1`}>
                        <div className="text-xs text-slate-300">{position.engineLabel ?? "Engine 1"} ({position.engineId ?? "engine1"})</div>
                        <div className="font-medium">{position.strategyLabel ?? position.strategy ?? "-"}</div>
                        <div className="text-xs text-slate-400">strategyId: {position.strategy ?? "-"}</div>
                        <div className="flex flex-wrap gap-1">
                          {typeof position.signalScore === "number" && scoreBadge("score", position.signalScore.toFixed(1))}
                          {position.tier && scoreBadge("tier", position.tier)}
                          {typeof position.confidence === "number" && scoreBadge("conf", position.confidence.toFixed(2))}
                          {position.strategyVariant && scoreBadge("variant", position.strategyVariant)}
                          {position.setupType && scoreBadge("setup", position.setupType)}
                        </div>
                        <details className="text-xs text-slate-300">
                          <summary className="cursor-pointer text-slate-400">reasoning</summary>
                          <div className="mt-1 grid grid-cols-2 gap-1">
                            <span>trend: {position.reasoning?.trend ?? "-"}</span>
                            <span>structure: {position.reasoning?.structure ?? "-"}</span>
                            <span>volatility: {position.reasoning?.volatility ?? "-"}</span>
                            <span>entry: {position.reasoning?.entry ?? "-"}</span>
                          </div>
                        </details>
                      </td>
                      <td className={textCellClass}>{position.closeReason ?? "-"}</td>
                      <td className={textCellClass}>{formatIso(position.openedAt)}</td>
                      <td className={textCellClass}>{formatIso(position.closedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-emerald-700/40 bg-emerald-950/10 p-4 sm:p-5">
              <h2 className="mb-3 text-lg font-semibold">Current Cycle — Selected</h2>
              <div className={tableWrapperClass}>
                <table className="min-w-[740px] w-full text-left text-sm">
                  <thead>
                    <tr>
                      <th className={headerCellClass}>Rank</th>
                      <th className={headerCellClass}>Market</th>
                      <th className={headerCellClass}>Symbol</th>
                      <th className={headerCellClass}>Score</th>
                      <th className={headerCellClass}>Engine / Strategy</th>
                      <th className={headerCellClass}>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.selected.map((entry) => (
                      <tr key={`${entry.marketType}-${entry.symbol}-${entry.rank}`} className="border-t border-emerald-900/40">
                        <td className={numericCellClass}>{entry.rank}</td>
                        <td className={textCellClass}><span className={badgeClass(entry.marketType)}>{entry.marketType}</span></td>
                        <td className={textCellClass}>{entry.symbol} {entry.side}</td>
                        <td className={numericCellClass}>{entry.score.toFixed(2)}</td>
                        <td className={textCellClass}>
                          <div className="text-xs text-slate-300">{entry.engineLabel ?? "Engine 1"} ({entry.engineId ?? "engine1"})</div>
                          <div className="text-xs text-slate-400">{entry.strategyLabel ?? "Compression Breakout"}</div>
                          <div className="text-xs text-slate-500">strategyId: {entry.strategyId ?? "-"}</div>
                        </td>
                        <td className={`${textCellClass} max-w-[360px] whitespace-normal break-words`}>{entry.selectedReason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-lg border border-amber-700/40 bg-amber-950/10 p-4 sm:p-5">
              <h2 className="mb-3 text-lg font-semibold">Current Cycle — Rejected</h2>
              <div className={tableWrapperClass}>
                <table className="min-w-[740px] w-full text-left text-sm">
                  <thead>
                    <tr>
                      <th className={headerCellClass}>Rank</th>
                      <th className={headerCellClass}>Market</th>
                      <th className={headerCellClass}>Symbol</th>
                      <th className={headerCellClass}>Score</th>
                      <th className={headerCellClass}>Engine / Strategy</th>
                      <th className={headerCellClass}>Rejection reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.rejected.map((entry) => (
                      <tr key={`${entry.marketType}-${entry.symbol}-${entry.rank}`} className="border-t border-amber-900/40">
                        <td className={numericCellClass}>{entry.rank}</td>
                        <td className={textCellClass}><span className={badgeClass(entry.marketType)}>{entry.marketType}</span></td>
                        <td className={textCellClass}>{entry.symbol} {entry.side}</td>
                        <td className={numericCellClass}>{entry.score.toFixed(2)}</td>
                        <td className={textCellClass}>
                          <div className="text-xs text-slate-300">{entry.engineLabel ?? "Engine 1"} ({entry.engineId ?? "engine1"})</div>
                          <div className="text-xs text-slate-400">{entry.strategyLabel ?? "Compression Breakout"}</div>
                          <div className="text-xs text-slate-500">strategyId: {entry.strategyId ?? "-"}</div>
                        </td>
                        <td className={`${textCellClass} max-w-[360px] whitespace-normal break-words`}>{entry.rejectionReason ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-slate-700/40 bg-slate-900/60 p-4 sm:p-5">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-lg font-semibold">Position Inspector / Lifecycle Detail</h2>
              <select
                className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
                value={inspected?.id ?? ""}
                onChange={(event) => setInspectorPositionId(event.target.value || null)}
              >
                {inspectorUniverse.map((position) => (
                  <option key={position.id} value={position.id}>{position.marketType} • {position.symbol} {position.side} ({position.status})</option>
                ))}
              </select>
            </div>
            {!inspected && <p className="text-sm text-slate-400">No position available.</p>}
            {inspected && (
              <div className="space-y-3 text-sm">
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <p>Market: <span className="font-medium">{inspected.marketType}</span></p>
                  <p>Symbol/Side: <span className="font-medium">{inspected.symbol} {inspected.side}</span></p>
                  <p>Status: <span className="font-medium">{inspected.status}</span></p>
                  <p>Engine: <span className="font-medium">{inspected.engineLabel ?? "Engine 1"} ({inspected.engineId ?? "engine1"})</span></p>
                  <p>Strategy: <span className="font-medium">{inspected.strategyLabel ?? inspected.strategy ?? "-"} / {inspected.strategy ?? "-"}</span></p>
                  <p>Entry reason: <span className="font-medium">{inspected.selectedReason ?? "-"}</span></p>
                  <p>Close reason: <span className="font-medium">{inspected.closeReason ?? "-"}</span></p>
                  <p>Stop pips / risk %: <span className="font-medium">{inspected.stopPips === null ? "-" : formatQty(inspected.stopPips)} / {inspected.riskPct === null ? "-" : `${(inspected.riskPct * 100).toFixed(2)}%`}</span></p>
                  <p>Qty/Notional/Margin: <span className="font-medium">{formatQty(inspected.qty)} / {formatMoney(inspected.notional)} / {formatMoney(inspected.marginUsed)}</span></p>
                  <p>Realized/Unrealized: <span className="font-medium">{formatMoney(inspected.realizedPnl)} / {formatMoney(inspected.unrealizedPnl)}</span></p>
                  <p>Opened/Closed: <span className="font-medium">{formatIso(inspected.openedAt)} / {formatIso(inspected.closedAt)}</span></p>
                </div>
                <div className={tableWrapperClass}>
                  <table className="min-w-[740px] w-full text-left text-sm">
                    <thead>
                      <tr>
                        <th className={headerCellClass}>At</th>
                        <th className={headerCellClass}>Market</th>
                        <th className={headerCellClass}>Status</th>
                        <th className={headerCellClass}>Close reason</th>
                        <th className={headerCellClass}>Price</th>
                        <th className={headerCellClass}>Remaining qty</th>
                        <th className={headerCellClass}>Remaining notional</th>
                        <th className={headerCellClass}>Stop</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inspectedLifecycle.map((event, index) => (
                        <tr key={`${event.createdAt}-${index}`} className="border-t border-slate-800/70">
                          <td className={textCellClass}>{formatIso(event.createdAt)}</td>
                          <td className={textCellClass}><span className={badgeClass(event.marketType)}>{event.marketType}</span></td>
                          <td className={textCellClass}>{event.status ?? "-"}</td>
                          <td className={textCellClass}>{event.closeReason ?? "-"}</td>
                          <td className={numericCellClass}>{event.currentPrice === null ? "-" : formatPrice(event.currentPrice)}</td>
                          <td className={numericCellClass}>{event.remainingQty === null ? "-" : formatQty(event.remainingQty)}</td>
                          <td className={numericCellClass}>{event.remainingNotional === null ? "-" : formatMoney(event.remainingNotional)}</td>
                          <td className={numericCellClass}>{event.stopPrice === null ? "-" : formatPrice(event.stopPrice)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </section>
  );
}
