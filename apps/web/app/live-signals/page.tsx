"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SignalRoomPayload } from "../../lib/signal-room/contracts";

type MarketType = "all" | "crypto" | "forex";
type AccountLedgerCard = {
  key: string;
  label: string;
  startingEquity: number;
  currentEquity: number;
  realizedPnl: number;
  unrealizedPnl: number;
  netPnl: number;
  usedMargin: number;
  freeMargin: number;
  openRisk: number | null;
  openPositionsCount: number;
  closedPositionsCount: number;
  wins: number;
  losses: number;
  partialWins: number;
  netR?: number | null;
};

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

const AUTO_REFRESH_MS = 7000;

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

function statusTag(label: string, tone: "ok" | "warn" | "bad" | "neutral" = "neutral") {
  const palette = tone === "ok"
    ? "bg-emerald-900/40 text-emerald-200 border-emerald-700/60"
    : tone === "warn"
      ? "bg-amber-900/40 text-amber-200 border-amber-700/60"
      : tone === "bad"
        ? "bg-rose-900/40 text-rose-200 border-rose-700/60"
        : "bg-slate-800 text-slate-200 border-slate-700";
  return <span className={`rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${palette}`}>{label}</span>;
}

function scoreBadge(label: string, value: string) {
  return <span className="rounded bg-violet-900/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-200">{label}: {value}</span>;
}

function reasoningItems(reasoning?: { trend: number | null; structure: number | null; volatility: number | null; entry: number | null }) {
  if (!reasoning) return [] as Array<[string, number]>;
  return ([
    ["trend", reasoning.trend],
    ["structure", reasoning.structure],
    ["volatility", reasoning.volatility],
    ["entry", reasoning.entry]
  ] as Array<[string, number | null]>).filter((item): item is [string, number] => typeof item[1] === "number");
}

function blockedStateLabels(params: {
  blockedReason: string | null;
  rejectedReason: string | null;
  activeOpenTrade: boolean;
  duplicateBlocked: boolean;
  cooldownBlocked: boolean;
  sameMoveBlocked: boolean;
  noNewStructureBlocked: boolean;
  duplicateTelegramBlocked: boolean;
}) {
  const labels: Array<ReturnType<typeof statusTag>> = [];
  if (params.activeOpenTrade) labels.push(statusTag("active_open_trade", "ok"));
  if (params.duplicateBlocked) labels.push(statusTag("duplicate_blocked", "bad"));
  if (params.cooldownBlocked) labels.push(statusTag("cooldown_blocked", "warn"));
  if (params.sameMoveBlocked) labels.push(statusTag("same_move_blocked", "warn"));
  if (params.noNewStructureBlocked) labels.push(statusTag("no_new_structure_blocked", "warn"));
  if (params.duplicateTelegramBlocked) labels.push(statusTag("telegram_blocked", "warn"));
  if (labels.length === 0 && (params.blockedReason || params.rejectedReason)) labels.push(statusTag("blocked", "warn"));
  return labels;
}

export default function Page() {
  const [data, setData] = useState<SignalRoomPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resetBusy, setResetBusy] = useState(false);
  const [activeView, setActiveView] = useState<MarketType>("all");
  const [inspectorPositionId, setInspectorPositionId] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [showRuntimeFeed, setShowRuntimeFeed] = useState(false);

  const load = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await fetch("/api/signal-room", { cache: "no-store" });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message ?? `Request failed (${res.status})`);
      }
      const payload = (await res.json()) as SignalRoomPayload;
      setData(payload);
      setError(null);
      setLastUpdatedAt(new Date().toISOString());
    } catch (err: unknown) {
      setData(null);
      setError(err instanceof Error ? err.message : "Unable to load signal room data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => {
      void load();
    }, AUTO_REFRESH_MS);
    return () => clearInterval(timer);
  }, [autoRefresh, load]);

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
      await load(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Signal reset failed");
    } finally {
      setResetBusy(false);
    }
  }

  const filtered = useMemo(() => {
    if (!data) return { open: [], closed: [], selected: [], rejected: [] };
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
      .filter((event) => (event.signalTradeId === inspected.id || event.symbol === inspected.symbol)
        && (activeView === "all" || event.marketType === activeView))
      .slice(0, 20);
  }, [activeView, data, inspected]);

  const accountCards = useMemo(() => {
    if (!data?.accountSummary) return [] as AccountLedgerCard[];
    const cards: AccountLedgerCard[] = [];
    if (data.accountSummary.crypto) cards.push({ key: "crypto", label: "Crypto paper ledger", ...data.accountSummary.crypto });
    if (data.accountSummary.forex) cards.push({ key: "forex", label: "Forex paper ledger", ...data.accountSummary.forex });
    if (data.accountSummary.combined) cards.push({ key: "combined", label: "Combined paper ledger", ...data.accountSummary.combined });
    return cards;
  }, [data]);

  const runtimePreview = useMemo(() => (data?.liveRuntimeEvents ?? []).slice(0, 15), [data]);

  const blockedCounts = useMemo(() => {
    if (!data) return { duplicate: 0, cooldown: 0, sameMove: 0, noNewStructure: 0, telegram: 0, activeOpen: 0 };
    return data.symbolScanBoard.reduce((acc, entry) => {
      if (entry.stateFlags?.duplicateBlocked) acc.duplicate += 1;
      if (entry.stateFlags?.cooldownBlocked) acc.cooldown += 1;
      if (entry.stateFlags?.sameMoveBlocked) acc.sameMove += 1;
      if (entry.stateFlags?.noNewStructureBlocked) acc.noNewStructure += 1;
      if (entry.stateFlags?.duplicateTelegramBlocked) acc.telegram += 1;
      if (entry.stateFlags?.activeOpenTrade) acc.activeOpen += 1;
      return acc;
    }, { duplicate: 0, cooldown: 0, sameMove: 0, noNewStructure: 0, telegram: 0, activeOpen: 0 });
  }, [data]);

  return (
    <section className="space-y-4 sm:space-y-5">
      <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Signal Mode Live Operator Console</h1>
          <p className="mt-1 text-sm text-slate-400">Live signal runtime, cycle state, symbol scan board, execution and Telegram visibility.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="rounded border border-slate-700 px-3 py-2 text-xs text-slate-100 hover:bg-slate-800/50" onClick={() => void load(true)} disabled={refreshing}>{refreshing ? "Refreshing…" : "Manual refresh"}</button>
          <button className={`rounded border px-3 py-2 text-xs ${autoRefresh ? "border-emerald-700/60 text-emerald-200" : "border-slate-700 text-slate-300"}`} onClick={() => setAutoRefresh((prev) => !prev)}>Auto-refresh: {autoRefresh ? "ON" : "OFF"}</button>
          <button className="rounded border border-rose-700/60 px-3 py-2 text-xs text-rose-200 hover:bg-rose-900/30 disabled:opacity-50" onClick={() => void runReset()} disabled={resetBusy}>{resetBusy ? "Resetting…" : "Reset signal-mode open state"}</button>
        </div>
      </header>

      <section className="rounded-lg border border-slate-700/50 bg-slate-900/40 p-3 text-xs text-slate-300"><div className="flex flex-wrap items-center gap-x-6 gap-y-2"><span>Refresh cadence: {AUTO_REFRESH_MS / 1000}s</span><span>Last updated: {formatIso(lastUpdatedAt)}</span><span>Runtime feed: {data?.liveRuntimeEvents.length ?? 0} recent persisted events</span></div></section>

      <nav className="flex flex-wrap gap-2">{(["all", "crypto", "forex"] as const).map((view) => (<button key={view} className={`rounded border px-3 py-1.5 text-xs uppercase tracking-wide ${activeView === view ? "border-sky-600 bg-sky-900/30 text-sky-100" : "border-slate-700 bg-slate-900/60 text-slate-300 hover:bg-slate-800/60"}`} onClick={() => setActiveView(view)}>{view}</button>))}</nav>

      {loading && <p className="rounded border border-slate-800 bg-slate-900/70 p-3 text-sm text-slate-300">Loading signal room…</p>}
      {error && <p className="rounded border border-rose-700/50 bg-rose-900/20 p-3 text-sm text-rose-200">{error}</p>}

      {data && (
        <>
          <section className="rounded-lg border border-emerald-700/40 bg-emerald-950/10 p-4 sm:p-5 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="text-lg font-semibold">Capital / Paper Account Truth</h2><p className="text-xs text-slate-400">Source: {data.accountSummary?.sourceOfTruth ?? "authoritative signal-room payload"}</p></div><p className="text-xs text-slate-400">Updated: {formatIso(data.accountSummary?.lastUpdatedAt ?? lastUpdatedAt)}</p></div>
            {!data.accountSummary?.combinedIsTruthful && <p className="rounded border border-amber-700/60 bg-amber-950/30 p-2 text-xs text-amber-200">Combined ledger hidden because split-ledger aggregation is not configured as a truthful total.</p>}
            <div className="grid gap-4 xl:grid-cols-3">{accountCards.map((ledger) => (<div key={ledger.key} className="rounded-md border border-emerald-900/40 bg-slate-950/50 p-3"><h3 className="text-sm font-semibold text-emerald-200">{ledger.label}</h3><div className="mt-2 grid gap-2 sm:grid-cols-2"><SummaryCard label="Starting equity" value={formatMoney(ledger.startingEquity)} /><SummaryCard label="Current equity" value={formatMoney(ledger.currentEquity)} /><SummaryCard label="Realized PnL" value={formatMoney(ledger.realizedPnl)} tone={toneForPnl(ledger.realizedPnl)} /><SummaryCard label="Unrealized PnL" value={formatMoney(ledger.unrealizedPnl)} tone={toneForPnl(ledger.unrealizedPnl)} /><SummaryCard label="Net PnL" value={formatMoney(ledger.netPnl)} tone={toneForPnl(ledger.netPnl)} /><SummaryCard label="Net R" value={ledger.netR === null || ledger.netR === undefined ? "-" : ledger.netR.toFixed(2)} tone={ledger.netR ? toneForPnl(ledger.netR) : "text-slate-100"} /><SummaryCard label="Open / Closed" value={`${ledger.openPositionsCount} / ${ledger.closedPositionsCount}`} /><SummaryCard label="Wins / Losses / TP1" value={`${ledger.wins} / ${ledger.losses} / ${ledger.partialWins}`} /><SummaryCard label="Used margin" value={formatMoney(ledger.usedMargin)} /><SummaryCard label="Free margin" value={formatMoney(ledger.freeMargin)} /><SummaryCard label="Open risk" value={ledger.openRisk === null ? "-" : formatMoney(ledger.openRisk)} /></div></div>))}</div>
          </section>

          <section className="rounded-lg border border-indigo-700/40 bg-indigo-950/10 p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold">Performance Summary (persisted truth)</h2>
                <p className="text-xs text-slate-400">{data.performanceSummary?.sourceOfTruth ?? "persisted signal-room truth path"}</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryCard label="Total / Open / Closed" value={`${data.performanceSummary?.totalTrades ?? 0} / ${data.performanceSummary?.openTrades ?? 0} / ${data.performanceSummary?.closedTrades ?? 0}`} />
              <SummaryCard label="Wins / Losses / Partial / BE" value={`${data.performanceSummary?.wins ?? 0} / ${data.performanceSummary?.losses ?? 0} / ${data.performanceSummary?.partialWins ?? 0} / ${data.performanceSummary?.breakeven ?? 0}`} />
              <SummaryCard label="Win rate" value={data.performanceSummary?.winRate === null || data.performanceSummary?.winRate === undefined ? "-" : `${data.performanceSummary.winRate.toFixed(1)}%`} />
              <SummaryCard label="Avg R / Net R" value={`${data.performanceSummary?.avgR === null || data.performanceSummary?.avgR === undefined ? "-" : data.performanceSummary.avgR.toFixed(2)} / ${data.performanceSummary?.netR === null || data.performanceSummary?.netR === undefined ? "-" : data.performanceSummary.netR.toFixed(2)}`} />
              <SummaryCard label="Avg realized PnL" value={data.performanceSummary?.avgRealizedPnl === null || data.performanceSummary?.avgRealizedPnl === undefined ? "-" : formatMoney(data.performanceSummary.avgRealizedPnl)} />
              <SummaryCard label="Net realized / Unrealized" value={`${formatMoney(data.performanceSummary?.netRealizedPnl ?? 0)} / ${formatMoney(data.performanceSummary?.unrealizedPnl ?? 0)}`} tone={toneForPnl((data.performanceSummary?.netRealizedPnl ?? 0) + (data.performanceSummary?.unrealizedPnl ?? 0))} />
              <SummaryCard label="Expectancy / Profit factor" value={`${data.performanceSummary?.expectancy === null || data.performanceSummary?.expectancy === undefined ? "-" : data.performanceSummary.expectancy.toFixed(2)} / ${data.performanceSummary?.profitFactor === null || data.performanceSummary?.profitFactor === undefined ? "-" : data.performanceSummary.profitFactor.toFixed(2)}`} />
              <SummaryCard label="Avg outcome min" value={data.performanceSummary?.avgTimeToOutcomeMinutes === null || data.performanceSummary?.avgTimeToOutcomeMinutes === undefined ? "-" : data.performanceSummary.avgTimeToOutcomeMinutes.toFixed(1)} />
            </div>

            <div className={tableWrapperClass}>
              <table className="min-w-[920px] w-full text-left text-sm">
                <thead><tr><th className={headerCellClass}>Window</th><th className={headerCellClass}>Opened</th><th className={headerCellClass}>Closed</th><th className={headerCellClass}>W/L/P/BE</th><th className={headerCellClass}>Realized PnL</th><th className={headerCellClass}>Net R</th><th className={headerCellClass}>Avg R</th><th className={headerCellClass}>Win rate</th><th className={headerCellClass}>Avg duration (min)</th></tr></thead>
                <tbody>
                  {[
                    data.performanceWindows?.todayUtc,
                    data.performanceWindows?.last24h,
                    data.performanceWindows?.allTime
                  ].filter((window): window is NonNullable<SignalRoomPayload["performanceWindows"]>[keyof NonNullable<SignalRoomPayload["performanceWindows"]>] => !!window).map((window) => (
                    <tr key={window.windowLabel} className="border-t border-indigo-900/30">
                      <td className={textCellClass}>{window.windowLabel}</td>
                      <td className={numericCellClass}>{window.openedTrades}</td>
                      <td className={numericCellClass}>{window.closedTrades}</td>
                      <td className={numericCellClass}>{window.wins}/{window.losses}/{window.partialWins}/{window.breakeven}</td>
                      <td className={numericCellClass}>{formatMoney(window.realizedPnl)}</td>
                      <td className={numericCellClass}>{window.netR === null ? "-" : window.netR.toFixed(2)}</td>
                      <td className={numericCellClass}>{window.avgR === null ? "-" : window.avgR.toFixed(2)}</td>
                      <td className={numericCellClass}>{window.winRate === null ? "-" : `${window.winRate.toFixed(1)}%`}</td>
                      <td className={numericCellClass}>{window.avgDurationMinutes === null ? "-" : window.avgDurationMinutes.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className={tableWrapperClass}>
              <table className="min-w-[980px] w-full text-left text-sm">
                <thead><tr><th className={headerCellClass}>Engine</th><th className={headerCellClass}>Strategy</th><th className={headerCellClass}>Opened</th><th className={headerCellClass}>Open</th><th className={headerCellClass}>Closed</th><th className={headerCellClass}>W/L/P/BE</th><th className={headerCellClass}>Realized PnL</th><th className={headerCellClass}>Net R</th><th className={headerCellClass}>Avg R</th><th className={headerCellClass}>Win rate</th><th className={headerCellClass}>Avg duration (min)</th></tr></thead>
                <tbody>
                  {(data.perEnginePerformance ?? []).map((engine) => (
                    <tr key={engine.engineId} className="border-t border-indigo-900/30">
                      <td className={textCellClass}>{engine.engineId}</td>
                      <td className={textCellClass}>{engine.strategyId ?? "-"}</td>
                      <td className={numericCellClass}>{engine.tradesOpened}</td>
                      <td className={numericCellClass}>{engine.openTrades}</td>
                      <td className={numericCellClass}>{engine.closedTrades}</td>
                      <td className={numericCellClass}>{engine.wins}/{engine.losses}/{engine.partialWins}/{engine.breakeven}</td>
                      <td className={`${numericCellClass} ${toneForPnl(engine.realizedPnl)}`}>{formatMoney(engine.realizedPnl)}</td>
                      <td className={numericCellClass}>{engine.netR === null ? "-" : engine.netR.toFixed(2)}</td>
                      <td className={numericCellClass}>{engine.avgR === null ? "-" : engine.avgR.toFixed(2)}</td>
                      <td className={numericCellClass}>{engine.winRate === null ? "-" : `${engine.winRate.toFixed(1)}%`}</td>
                      <td className={numericCellClass}>{engine.avgDurationMinutes === null ? "-" : engine.avgDurationMinutes.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-lg border border-violet-700/40 bg-violet-950/10 p-4 sm:p-5 space-y-3">
            <h2 className="text-lg font-semibold">Current Cycle Live</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><SummaryCard label="Cycle" value={data.currentCycleLive.cycleNumber?.toString() ?? data.currentCycleLive.cycleId ?? "-"} /><SummaryCard label="Cycle started" value={formatIso(data.currentCycleLive.cycleStartedAt)} /><SummaryCard label="Symbols total" value={String(data.currentCycleLive.symbolsTotal)} /><SummaryCard label="Symbols ready / blocked" value={`${data.currentCycleLive.symbolsReady} / ${data.currentCycleLive.symbolsBlocked}`} /><SummaryCard label="Dispatched to scan" value={String(data.currentCycleLive.symbolsDispatchedToScan)} /><SummaryCard label="Engine scan attempts" value={String(data.currentCycleLive.engineScanAttempts)} /><SummaryCard label="Candidates gen / rej / sel" value={`${data.currentCycleLive.candidatesGenerated} / ${data.currentCycleLive.candidatesRejected} / ${data.currentCycleLive.candidatesSelected}`} /><SummaryCard label="Paper executed / Telegram sent" value={`${data.currentCycleLive.paperExecuted} / ${data.currentCycleLive.telegramSent}`} /><SummaryCard label="Duplicate blocks (cycle)" value={String(data.duplicateSafetyDiagnostics?.duplicateBlocksThisCycle ?? blockedCounts.duplicate)} /><SummaryCard label="Active-symbol blocks" value={String(data.duplicateSafetyDiagnostics?.activeSymbolBlocksThisCycle ?? 0)} /><SummaryCard label="Cooldown blocks" value={String(data.duplicateSafetyDiagnostics?.cooldownBlocksThisCycle ?? blockedCounts.cooldown)} /><SummaryCard label="Same-move / Telegram blocks" value={`${data.duplicateSafetyDiagnostics?.sameMoveBlocksThisCycle ?? blockedCounts.sameMove} / ${data.duplicateSafetyDiagnostics?.duplicateTelegramBlocksThisCycle ?? blockedCounts.telegram}`} /></div>
          </section>

          <section className="rounded-lg border border-teal-700/40 bg-teal-950/10 p-4 sm:p-5"><h2 className="mb-3 text-lg font-semibold">Per-Symbol Live Scan Board</h2><div className={tableWrapperClass}><table className={tableClass}><thead><tr><th className={headerCellClass}>Market</th><th className={headerCellClass}>Symbol</th><th className={headerCellClass}>Blocked reason</th><th className={headerCellClass}>Execution truth flags</th><th className={headerCellClass}>Candidate / Selected</th><th className={headerCellClass}>Paper / Telegram</th></tr></thead><tbody>{data.symbolScanBoard.filter((entry) => activeView === "all" || entry.marketType === activeView).map((entry) => { const flags = entry.stateFlags ?? { activeOpenTrade: false, duplicateBlocked: false, cooldownBlocked: false, sameMoveBlocked: false, noNewStructureBlocked: false, duplicateTelegramBlocked: false }; const stateTags = blockedStateLabels({ blockedReason: entry.blockedReason, rejectedReason: entry.rejectedReason, ...flags }); return (<tr key={`${entry.marketType}-${entry.symbol}`} className="border-t border-teal-900/30"><td className={textCellClass}><span className={badgeClass(entry.marketType)}>{entry.marketType}</span></td><td className={textCellClass}>{entry.symbol}</td><td className={`${textCellClass} max-w-[260px] whitespace-normal break-words`}>{entry.blockedReason ?? entry.rejectedReason ?? "-"}</td><td className={textCellClass}><div className="flex flex-wrap gap-1">{stateTags.length > 0 ? stateTags : <span className="text-slate-500">-</span>}</div></td><td className={textCellClass}>{entry.candidateGenerated ? statusTag("candidate", "ok") : statusTag("none", "neutral")} {entry.selected ? statusTag("selected", "ok") : statusTag("rejected", "warn")}</td><td className={textCellClass}>{entry.paperExecuted ? statusTag("paper", "ok") : statusTag("paper_no", "warn")} {entry.telegramSent ? statusTag("telegram", "ok") : statusTag("telegram_no", "warn")}</td></tr>); })}</tbody></table></div></section>

          <section className="rounded-lg border border-sky-700/30 bg-sky-950/10 p-4 sm:p-5"><h2 className="mb-3 text-lg font-semibold">Open Positions (live lifecycle view)</h2><div className={tableWrapperClass}><table className={tableClass}><thead><tr><th className={headerCellClass}>Market</th><th className={headerCellClass}>Symbol</th><th className={headerCellClass}>Status</th><th className={headerCellClass}>Entry time</th><th className={headerCellClass}>Entry / Mark</th><th className={headerCellClass}>Unrealized PnL</th><th className={headerCellClass}>Remaining qty</th><th className={headerCellClass}>Stop / TP state</th><th className={headerCellClass}>Last lifecycle event</th><th className={headerCellClass}>Reasoning</th></tr></thead><tbody>{filtered.open.map((position) => { const reasonParts = reasoningItems(position.reasoning); return (<tr key={position.id} className="border-t border-sky-900/40"><td className={textCellClass}><span className={badgeClass(position.marketType)}>{position.marketType}</span></td><td className={textCellClass}>{position.symbol} {position.side}</td><td className={textCellClass}>{statusTag(position.status === "partially_closed" ? "tp1_hit_open" : "open", position.status === "partially_closed" ? "warn" : "ok")}</td><td className={textCellClass}>{formatIso(position.openedAt)}</td><td className={numericCellClass}>{formatPrice(position.entryPrice)} / {formatPrice(position.markPrice)}</td><td className={`${numericCellClass} ${toneForPnl(position.unrealizedPnl)}`}>{formatMoney(position.unrealizedPnl)}</td><td className={numericCellClass}>{formatQty(position.qty)}</td><td className={textCellClass}>SL {formatPrice(position.stopPrice)} / TP1 {formatPrice(position.tp1Price)} / TP2 {formatPrice(position.tp2Price)}</td><td className={textCellClass}>{position.lastLifecycleEvent ?? "-"}<div className="text-xs text-slate-500">{formatIso(position.lastLifecycleEventAt ?? null)}</div></td><td className={textCellClass}>{reasonParts.length > 0 ? (<div className="flex flex-wrap gap-1">{reasonParts.map(([k, v]) => scoreBadge(k, v.toFixed(1)))}</div>) : (<span className="text-slate-500">{position.selectedReason ?? "no structured reasoning"}</span>)}</td></tr>); })}</tbody></table></div></section>

          <section className="grid gap-4 lg:grid-cols-2"><div className="rounded-lg border border-emerald-700/40 bg-emerald-950/10 p-4 sm:p-5"><h2 className="mb-3 text-lg font-semibold">Current Cycle — Selected / Admitted</h2><div className={tableWrapperClass}><table className="min-w-[740px] w-full text-left text-sm"><thead><tr><th className={headerCellClass}>Rank</th><th className={headerCellClass}>Market</th><th className={headerCellClass}>Symbol</th><th className={headerCellClass}>Score</th><th className={headerCellClass}>Engine / Strategy</th><th className={headerCellClass}>Lifecycle</th></tr></thead><tbody>{filtered.selected.map((entry) => (<tr key={`${entry.marketType}-${entry.symbol}-${entry.rank}`} className="border-t border-emerald-900/40"><td className={numericCellClass}>{entry.rank}</td><td className={textCellClass}><span className={badgeClass(entry.marketType)}>{entry.marketType}</span></td><td className={textCellClass}>{entry.symbol} {entry.side}</td><td className={numericCellClass}>{entry.score.toFixed(2)}</td><td className={textCellClass}>{entry.engineLabel ?? entry.engineId ?? "-"} / {entry.strategyLabel ?? entry.strategyId ?? "-"}</td><td className={textCellClass}>{statusTag("selected", "ok")} {entry.paperTradeStatus === "opened" ? statusTag("paper_executed", "ok") : statusTag("paper_not_opened", "warn")} {entry.telegramDispatchStatus === "sent" ? statusTag("telegram_sent", "ok") : statusTag(entry.telegramDispatchStatus, "warn")}</td></tr>))}</tbody></table></div></div><div className="rounded-lg border border-amber-700/40 bg-amber-950/10 p-4 sm:p-5"><h2 className="mb-3 text-lg font-semibold">Current Cycle — Rejected / Blocked</h2><div className={tableWrapperClass}><table className="min-w-[740px] w-full text-left text-sm"><thead><tr><th className={headerCellClass}>Rank</th><th className={headerCellClass}>Market</th><th className={headerCellClass}>Symbol</th><th className={headerCellClass}>Score</th><th className={headerCellClass}>Engine / Strategy</th><th className={headerCellClass}>Reason</th></tr></thead><tbody>{filtered.rejected.map((entry) => (<tr key={`${entry.marketType}-${entry.symbol}-${entry.rank}`} className="border-t border-amber-900/40"><td className={numericCellClass}>{entry.rank}</td><td className={textCellClass}><span className={badgeClass(entry.marketType)}>{entry.marketType}</span></td><td className={textCellClass}>{entry.symbol} {entry.side}</td><td className={numericCellClass}>{entry.score.toFixed(2)}</td><td className={textCellClass}>{entry.engineLabel ?? entry.engineId ?? "-"} / {entry.strategyLabel ?? entry.strategyId ?? "-"}</td><td className={`${textCellClass} max-w-[360px] whitespace-normal break-words`}>{entry.rejectionReason ?? "-"}</td></tr>))}</tbody></table></div></div></section>

          <section className="rounded-lg border border-slate-700/40 bg-slate-900/60 p-4 sm:p-5"><div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><h2 className="text-lg font-semibold">Signal Lifecycle Trail</h2><select className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm" value={inspected?.id ?? ""} onChange={(event) => setInspectorPositionId(event.target.value || null)}>{inspectorUniverse.map((position) => (<option key={position.id} value={position.id}>{position.marketType} • {position.symbol} {position.side} ({position.status})</option>))}</select></div>{!inspected && <p className="text-sm text-slate-400">No position available.</p>}{inspected && (<div className="space-y-3 text-sm"><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4"><p>Symbol: <span className="font-medium">{inspected.symbol} {inspected.side}</span></p><p>Status: <span className="font-medium">{inspected.status}</span></p><p>Selected reason: <span className="font-medium">{inspected.selectedReason ?? "-"}</span></p><p>Rejected/close reason: <span className="font-medium">{inspected.rejectedReason ?? inspected.closeReason ?? "-"}</span></p></div><div className={tableWrapperClass}><table className="min-w-[760px] w-full text-left text-sm"><thead><tr><th className={headerCellClass}>At</th><th className={headerCellClass}>Status</th><th className={headerCellClass}>Close reason</th><th className={headerCellClass}>Price</th><th className={headerCellClass}>Remaining qty</th><th className={headerCellClass}>Stop</th></tr></thead><tbody>{inspectedLifecycle.map((event, index) => (<tr key={`${event.createdAt}-${index}`} className="border-t border-slate-800/70"><td className={textCellClass}>{formatIso(event.createdAt)}</td><td className={textCellClass}>{event.status ?? "-"}</td><td className={textCellClass}>{event.closeReason ?? "-"}</td><td className={numericCellClass}>{event.currentPrice === null ? "-" : formatPrice(event.currentPrice)}</td><td className={numericCellClass}>{event.remainingQty === null ? "-" : formatQty(event.remainingQty)}</td><td className={numericCellClass}>{event.stopPrice === null ? "-" : formatPrice(event.stopPrice)}</td></tr>))}</tbody></table></div></div>)}</section>

          <section className="rounded-lg border border-fuchsia-700/40 bg-fuchsia-950/10 p-4 sm:p-5 space-y-2">
            <h2 className="text-lg font-semibold">Duplicate Burst Root-Cause Audit (ETH)</h2>
            <p className="text-sm text-slate-300">{data.duplicateBurstRootCauseAudit?.rootCause ?? "No persisted audit available."}</p>
            <p className="text-xs text-slate-400">Exact cause confirmed: {data.duplicateBurstRootCauseAudit?.exactCauseConfirmed ? "YES" : "NO"}</p>
          </section>

          <section className="rounded-lg border border-cyan-700/40 bg-cyan-950/10 p-4 sm:p-5 space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">Raw Live Runtime Feed (secondary)</h2><button className="rounded border border-cyan-700/70 px-3 py-1.5 text-xs text-cyan-200 hover:bg-cyan-900/30" onClick={() => setShowRuntimeFeed((prev) => !prev)}>{showRuntimeFeed ? "Collapse Raw Runtime Feed" : `Show Runtime Feed (${runtimePreview.length}/${data.liveRuntimeEvents.length})`}</button></div>{showRuntimeFeed ? (<div className={tableWrapperClass}><table className={tableClass}><thead><tr><th className={headerCellClass}>At</th><th className={headerCellClass}>Event</th><th className={headerCellClass}>Cycle</th><th className={headerCellClass}>Symbol / Market</th><th className={headerCellClass}>Engine / Strategy</th><th className={headerCellClass}>Result / Reason</th><th className={headerCellClass}>Summary</th></tr></thead><tbody>{data.liveRuntimeEvents.map((event) => (<tr key={event.id} className="border-t border-cyan-900/30"><td className={textCellClass}>{formatIso(event.at)}</td><td className={textCellClass}>{event.eventType}</td><td className={textCellClass}>{event.cycleNumber ?? event.cycleId ?? "-"}</td><td className={textCellClass}>{event.symbol ? `${event.symbol} ${event.marketType ? `(${event.marketType})` : ""}` : "-"}</td><td className={textCellClass}>{event.engineId ?? "-"} / {event.strategyId ?? "-"}</td><td className={textCellClass}>{event.result ?? "-"} {event.reason ? `• ${event.reason}` : ""}</td><td className={`${textCellClass} max-w-[360px] whitespace-normal break-words`}>{event.summary ?? "-"}</td></tr>))}</tbody></table></div>) : (<div className={tableWrapperClass}><table className={tableClass}><thead><tr><th className={headerCellClass}>At</th><th className={headerCellClass}>Event</th><th className={headerCellClass}>Symbol</th><th className={headerCellClass}>Result</th><th className={headerCellClass}>Summary</th></tr></thead><tbody>{runtimePreview.map((event) => (<tr key={event.id} className="border-t border-cyan-900/30"><td className={textCellClass}>{formatIso(event.at)}</td><td className={textCellClass}>{event.eventType}</td><td className={textCellClass}>{event.symbol ?? "-"}</td><td className={textCellClass}>{event.result ?? event.reason ?? "-"}</td><td className={`${textCellClass} max-w-[360px] whitespace-normal break-words`}>{event.summary ?? "-"}</td></tr>))}</tbody></table></div>)}</section>
        </>
      )}
    </section>
  );
}
