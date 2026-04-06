"use client";

import { useEffect, useState } from "react";
import type { SignalRoomPayload } from "../../lib/signal-room/contracts";

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-900/70 p-3 sm:p-4">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-100 sm:text-xl">{value}</p>
    </div>
  );
}

function toneForOutcome(outcome: string | null) {
  if (outcome === "win") return "text-emerald-300";
  if (outcome === "loss") return "text-rose-300";
  if (outcome === "partial_win") return "text-amber-300";
  return "text-slate-300";
}

const tableWrapperClass = "overflow-x-auto rounded-md border border-slate-800/80";
const tableClass = "min-w-[980px] w-full text-left text-sm";
const headerCellClass = "px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-300 bg-slate-950/70";
const textCellClass = "px-3 py-2 align-top text-slate-200";
const numericCellClass = "px-3 py-2 align-top text-right tabular-nums text-slate-100 whitespace-nowrap";

function formatPrice(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 6, minimumFractionDigits: 2 });
}

function formatQty(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function formatMoney(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

function formatPct(value: number) {
  return `${(value * 100).toFixed(2)}%`;
}

function formatIso(value: string | null) {
  if (!value) return "-";
  return new Date(value).toISOString().replace("T", " ").slice(0, 19);
}

export default function Page() {
  const [data, setData] = useState<SignalRoomPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resetBusy, setResetBusy] = useState(false);

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

  return (
    <section className="space-y-4 sm:space-y-5">
      <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Signal Room</h1>
          <p className="mt-1 text-sm text-slate-400">Signal-mode lifecycle truth: cycle activity, persisted totals, and Telegram reconciliation.</p>
        </div>
        <button
          className="rounded border border-rose-700/60 px-3 py-2 text-xs text-rose-200 hover:bg-rose-900/30 disabled:opacity-50"
          onClick={() => void runReset()}
          disabled={resetBusy}
        >
          {resetBusy ? "Resetting…" : "Reset signal-mode open state"}
        </button>
      </header>

      {loading && <p className="rounded border border-slate-800 bg-slate-900/70 p-3 text-sm text-slate-300">Loading signal room…</p>}
      {error && <p className="rounded border border-rose-700/50 bg-rose-900/20 p-3 text-sm text-rose-200">{error}</p>}

      {data && (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="Current cycle candidates" value={data.currentCycleSummary.candidatesEvaluated} />
            <SummaryCard label="Selected actionable count" value={data.currentCycleSummary.selectedActionableCount} />
            <SummaryCard label="Telegram dispatched" value={data.currentCycleSummary.telegramDispatchedCount} />
            <SummaryCard label="Rejected" value={data.currentCycleSummary.rejectedCount} />
          </section>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="Allowed symbols active" value={data.controlPlane.allowedSymbolsRuntimeCount} />
            <SummaryCard label="Scanned this cycle" value={data.cycleTruth?.symbolsActuallyScanned?.length ?? 0} />
            <SummaryCard label="Closed this cycle" value={data.cycleTruth?.closedSignalsThisCycle ?? 0} />
            <SummaryCard label="Max concurrent blocked" value={data.cycleTruth?.maxConcurrentBlockedCount ?? 0} />
          </section>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <SummaryCard label="Persisted open" value={data.reconciliation.persistedTotals.totalOpenSignals} />
            <SummaryCard label="Persisted closed" value={data.reconciliation.persistedTotals.totalClosedSignals} />
            <SummaryCard label="Persisted resolved outcomes" value={data.reconciliation.persistedTotals.totalResolvedSignals} />
            <SummaryCard label="Telegram records" value={data.reconciliation.persistedTotals.totalTelegramDispatchRecords} />
            <SummaryCard label="Total persisted signals" value={data.reconciliation.persistedTotals.totalPersistedSignals} />
          </section>

          <section className="rounded-lg border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-300 sm:p-5">
            <h2 className="text-lg font-semibold text-slate-100">Signal Mode Settings / Paper Model</h2>
            <div className="mt-2 grid gap-x-4 gap-y-2 sm:grid-cols-2 xl:grid-cols-3">
              <p>Restart policy: <span className="font-medium">{data.restartPolicy.configuredPolicy}</span></p>
              <p>Resumed from persisted DB: <span className="font-medium">{String(data.restartPolicy.resumedFromPersistedDb)}</span></p>
              <p>Paper equity: <span className="font-medium">{data.paperModel.equity}</span></p>
              <p>Paper risk %: <span className="font-medium">{(data.paperModel.riskPct * 100).toFixed(2)}%</span></p>
              <p>Paper leverage: <span className="font-medium">{data.paperModel.leverage}x</span></p>
              <p>Max total notional mult: <span className="font-medium">{data.paperModel.maxTotalNotionalMult}x</span></p>
              <p>Max open risk %: <span className="font-medium">{(data.paperModel.maxOpenRiskPct * 100).toFixed(2)}%</span></p>
              <p>Leverage meaning: <span className="font-medium">Configured cap only; effective leverage = notional / equity</span></p>
              <p>Max concurrent positions: <span className="font-medium">{data.paperModel.maxConcurrentPositions}</span></p>
              <p>Open positions now: <span className="font-medium">{data.capitalAllocation.currentOpenPositionsCount}</span></p>
              <p>Total open notional: <span className="font-medium">{data.capitalAllocation.totalOpenNotional.toFixed(2)}</span></p>
              <p>Effective portfolio leverage: <span className="font-medium">{data.capitalAllocation.effectivePortfolioLeverage.toFixed(4)}x</span></p>
              <p>Used open risk budget: <span className="font-medium">{data.capitalAllocation.usedOpenRiskBudget.toFixed(2)}</span></p>
              <p>Remaining risk budget: <span className="font-medium">{data.capitalAllocation.availableRiskBudget.toFixed(2)}</span></p>
              <p>Remaining notional capacity: <span className="font-medium">{data.capitalAllocation.availableNotionalCapacity.toFixed(2)}</span></p>
              <p>Blocked by max concurrent this cycle: <span className="font-medium">{String(data.capitalAllocation.blockedByMaxConcurrentRulesThisCycle)}</span></p>
              <p>Runtime allowed symbols: <span className="font-medium">{data.controlPlane.allowedSymbolsRuntime.join(", ") || "-"}</span></p>
              <p>Configured default symbols: <span className="font-medium">{data.controlPlane.allowedSymbolsConfiguredDefaults.join(", ") || "-"}</span></p>
              <p>Min tier: <span className="font-medium">{data.paperModel.minTier}</span></p>
              <p>Min TP2 R: <span className="font-medium">{data.paperModel.minTp2R}</span></p>
              <p>Cooldown (min): <span className="font-medium">{data.paperModel.symbolCooldownMinutes}</span></p>
              <p>Entry stretch ATR cap: <span className="font-medium">{data.paperModel.maxEntryStretchAtr}</span></p>
              <p>Partial TP1 enabled: <span className="font-medium">{String(data.paperModel.partialAtTp1Enabled)}</span></p>
              <p>Partial at TP1 %: <span className="font-medium">{(data.paperModel.partialPct * 100).toFixed(0)}%</span></p>
              <p>Selected cap / cycle: <span className="font-medium">{data.signalSelectionPolicy.selectedCapPerCycle}</span></p>
              <p>Telegram cap / cycle: <span className="font-medium">{data.signalSelectionPolicy.telegramCapPerCycle}</span></p>
              <p>Diversification mode: <span className="font-medium">{data.signalSelectionPolicy.diversificationEnabled ? data.signalSelectionPolicy.diversificationMode : "disabled"}</span></p>
              <p>Portfolio capacity usage: <span className="font-medium">{data.currentCycleSummary.portfolioCapacityUsage.selectedCount}/{data.currentCycleSummary.portfolioCapacityUsage.selectedCap}</span></p>
              <p>Diversification notes: <span className="font-medium">{data.currentCycleSummary.diversificationNotes.join(" | ") || "none"}</span></p>
            </div>
          </section>

          <section className="rounded-lg border border-emerald-700/40 bg-emerald-950/10 p-4 sm:p-5">
            <h2 className="text-lg font-semibold">Selected This Cycle</h2>
            <div className={`mt-3 ${tableWrapperClass}`}>
              <table className={tableClass}>
                <thead><tr><th className={headerCellClass}>Rank</th><th className={headerCellClass}>Symbol</th><th className={headerCellClass}>Score</th><th className={headerCellClass}>Tier</th><th className={headerCellClass}>Group</th><th className={headerCellClass}>Reason</th><th className={headerCellClass}>Telegram</th><th className={headerCellClass}>Paper</th></tr></thead>
                <tbody>
                  {data.selectedThisCycle.map((entry) => (
                    <tr key={`${entry.symbol}-${entry.rank}`} className="border-t border-emerald-900/40">
                      <td className={numericCellClass}>{entry.rank}</td><td className={textCellClass}><span className="font-medium">{entry.symbol}</span> <span className="text-slate-400">{entry.side}</span></td><td className={numericCellClass}>{entry.score.toFixed(2)}</td><td className={textCellClass}>{entry.tier}</td><td className={textCellClass}>{entry.diversificationGroup}</td><td className={`${textCellClass} max-w-[340px] whitespace-normal break-words`}>{entry.selectedReason}</td><td className={textCellClass}>{entry.telegramDispatchStatus}</td><td className={textCellClass}>{entry.paperTradeStatus}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-lg border border-amber-700/30 bg-amber-950/10 p-4 sm:p-5">
            <h2 className="text-lg font-semibold">Rejected This Cycle</h2>
            <div className={`mt-3 ${tableWrapperClass}`}>
              <table className={tableClass}>
                <thead><tr><th className={headerCellClass}>Rank</th><th className={headerCellClass}>Symbol</th><th className={headerCellClass}>Score</th><th className={headerCellClass}>Tier</th><th className={headerCellClass}>Group</th><th className={headerCellClass}>Reason</th></tr></thead>
                <tbody>
                  {data.rejectedThisCycle.map((entry) => (
                    <tr key={`${entry.symbol}-${entry.rank}`} className="border-t border-amber-900/40">
                      <td className={numericCellClass}>{entry.rank}</td><td className={textCellClass}><span className="font-medium">{entry.symbol}</span> <span className="text-slate-400">{entry.side}</span></td><td className={numericCellClass}>{entry.score.toFixed(2)}</td><td className={textCellClass}>{entry.tier}</td><td className={textCellClass}>{entry.diversificationGroup}</td><td className={`${textCellClass} max-w-[400px] whitespace-normal break-words text-amber-100/90`}>{entry.rejectionReason ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-lg border border-sky-700/30 bg-sky-950/10 p-4 sm:p-5">
            <header className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Open Paper Trades</h2>
              <p className="text-xs text-slate-400">Persisted open positions with sizing + Telegram dispatch truth</p>
            </header>
            <div className={tableWrapperClass}>
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th className={headerCellClass}>Symbol</th><th className={headerCellClass}>Entry</th><th className={headerCellClass}>Stop</th><th className={headerCellClass}>TP1 / TP2</th>
                    <th className={headerCellClass}>Stop dist</th><th className={headerCellClass}>Qty</th><th className={headerCellClass}>Notional</th><th className={headerCellClass}>Risk</th><th className={headerCellClass}>Leverage</th>
                    <th className={headerCellClass}>Move / dist</th><th className={headerCellClass}>PnL / R</th><th className={headerCellClass}>Telegram</th><th className={headerCellClass}>Opened</th>
                  </tr>
                </thead>
                <tbody>
                  {data.openTrades.map((trade) => (
                    <tr key={trade.id} className="border-t border-sky-900/40">
                      <td className={textCellClass}><span className="font-medium">{trade.symbol}</span> <span className="text-slate-400">{trade.side}</span></td>
                      <td className={numericCellClass}>{formatPrice(trade.entryPrice)}</td>
                      <td className={numericCellClass}>{formatPrice(trade.stopPrice)}</td>
                      <td className={numericCellClass}>{formatPrice(trade.tp1Price)} / {formatPrice(trade.tp2Price)}</td>
                      <td className={numericCellClass}>{formatPrice(trade.paperComputed?.stopDistance ?? Math.abs(trade.entryPrice - trade.stopPrice))}</td>
                      <td className={numericCellClass}>{formatQty(trade.quantity ?? 0)}</td>
                      <td className={numericCellClass}>{formatMoney(trade.paperComputed?.notionalQuote ?? trade.notional ?? 0)}</td>
                      <td className={numericCellClass}>{formatPct(trade.paperComputed?.positionRiskPct ?? trade.riskPct ?? 0)} ({formatMoney(trade.paperComputed?.riskAmountQuote ?? trade.riskAmount ?? 0)})</td>
                      <td className={numericCellClass}>
                        cap {(trade.paperComputed?.configuredLeverageCap ?? trade.leverage ?? 0).toFixed(2)}x / eff {(trade.paperComputed?.effectiveLeverage ?? 0).toFixed(2)}x
                      </td>
                      <td className={numericCellClass}>
                        move {(trade.paperComputed?.priceMovePct ?? 0).toFixed(4)}% / stop {(trade.paperComputed?.distanceToStopPct ?? 0).toFixed(4)}% / tp1 {(trade.paperComputed?.distanceToTp1Pct ?? 0).toFixed(4)}% / tp2 {(trade.paperComputed?.distanceToTp2Pct ?? 0).toFixed(4)}%
                      </td>
                      <td className={numericCellClass}>{formatMoney(trade.paperComputed?.unrealizedPnlQuote ?? trade.unrealizedPnl ?? 0)} / {(trade.paperComputed?.rResultOpen ?? 0).toFixed(2)}R</td>
                      <td className={`${textCellClass} max-w-[280px] whitespace-normal break-words`}>{trade.telegramDispatchStatus} ({trade.telegramDispatchReason ?? "-"})</td>
                      <td className={textCellClass}>{formatIso(trade.openedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-lg border border-indigo-700/30 bg-indigo-950/10 p-4 sm:p-5">
            <h2 className="text-lg font-semibold">Closed Paper Trades</h2>
            <div className={`mt-3 ${tableWrapperClass}`}>
              <table className={tableClass}>
                <thead><tr><th className={headerCellClass}>Symbol</th><th className={headerCellClass}>Outcome</th><th className={headerCellClass}>Realized PnL / R</th><th className={headerCellClass}>Leverage cap / eff</th><th className={headerCellClass}>Closed at</th></tr></thead>
                <tbody>
                  {data.closedTrades.map((trade) => (
                    <tr key={trade.id} className="border-t border-indigo-900/40">
                      <td className={textCellClass}><span className="font-medium">{trade.symbol}</span> <span className="text-slate-400">{trade.side}</span></td>
                      <td className={`px-3 py-2 ${toneForOutcome(trade.outcome)}`}>{trade.outcome ?? "-"}</td>
                      <td className={numericCellClass}>{formatMoney(trade.paperComputed?.realizedPnlQuote ?? trade.realizedPnl ?? 0)} / {(trade.paperComputed?.rResultClosed ?? 0).toFixed(2)}R</td>
                      <td className={numericCellClass}>cap {(trade.paperComputed?.configuredLeverageCap ?? 0).toFixed(2)}x / eff {(trade.paperComputed?.effectiveLeverage ?? 0).toFixed(2)}x</td>
                      <td className={textCellClass}>{formatIso(trade.closedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-lg border border-slate-800 bg-slate-900/70 p-4 sm:p-5">
            <h2 className="text-lg font-semibold">Recent Actionable Signals</h2>
            <p className="text-xs text-slate-400">Persisted actionable rows only (latest 20).</p>
            <div className={`mt-3 ${tableWrapperClass}`}>
              <table className={tableClass}>
                <thead><tr><th className={headerCellClass}>Symbol</th><th className={headerCellClass}>Score</th><th className={headerCellClass}>Telegram</th><th className={headerCellClass}>Reason</th><th className={headerCellClass}>Generated at</th></tr></thead>
                <tbody>
                  {data.recentActionableSignals.map((signal) => (
                    <tr key={signal.id} className="border-t border-slate-800">
                      <td className={textCellClass}><span className="font-medium">{signal.symbol}</span> <span className="text-slate-400">{signal.side}</span></td>
                      <td className={numericCellClass}>{signal.score.toFixed(2)}</td>
                      <td className={textCellClass}>{signal.telegramDispatchStatus ?? "n/a"}</td>
                      <td className={`${textCellClass} max-w-[360px] whitespace-normal break-words`}>{signal.telegramDispatchReason ?? "-"}</td>
                      <td className={textCellClass}>{formatIso(signal.generatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {data.cycleTruth && (
            <section className="rounded border border-slate-800 bg-slate-900/70 p-4">
              <h2 className="text-lg font-semibold">Cycle Truth / Rejection Breakdown</h2>
              <p className="mt-2 text-xs text-slate-400">Why only one signal fired is explained here: runtime allowlist, scanned symbols, and exact filter counts.</p>
              <p className="mt-2 text-sm">Allowed symbols configured: {data.cycleTruth.allowedSymbolsConfigured?.join(", ") || "-"}</p>
              <p className="text-sm">Symbols scanned: {data.cycleTruth.symbolsActuallyScanned?.join(", ") || "-"}</p>
              <p className="text-sm">Skipped before evaluation: {data.cycleTruth.symbolsSkippedBeforeEvaluation?.join(", ") || "-"}</p>
              <ul className="mt-3 space-y-1 text-sm text-slate-300">
                {Object.entries(data.cycleTruth.candidatesRejectedBy ?? {}).map(([reason, count]) => (
                  <li key={reason}>{reason}: {count}</li>
                ))}
              </ul>
            </section>
          )}

          
        </>
      )}
    </section>
  );
}
