"use client";

import { useEffect, useState } from "react";

type SignalTrade = {
  id: string;
  signalEventId: string;
  cycleId: string | null;
  symbol: string;
  side: string;
  entryPrice: number;
  stopPrice: number;
  tp1Price: number;
  tp2Price: number;
  status: string;
  currentPrice: number | null;
  openedAt: string;
  closedAt: string | null;
  outcome: string | null;
  unrealizedPnl: number | null;
  realizedPnl: number | null;
  paperEquityBase: number | null;
  leverage: number | null;
  riskPct: number | null;
  riskAmount: number | null;
  quantity: number | null;
  notional: number | null;
  telegramDispatchStatus: string;
  telegramDispatchedAt: string | null;
  telegramDispatchReason: string | null;
  paperComputed?: {
    stopDistance: number;
    effectiveLeverage: number;
    configuredLeverageCap: number;
    positionRiskPct: number;
    riskAmountQuote: number;
    quantity: number;
    notionalQuote: number;
    realizedPnlQuote: number;
    unrealizedPnlQuote: number;
    rResultClosed: number;
    rResultOpen: number;
  };
};

type SignalEvent = {
  id: string;
  cycleId: string | null;
  symbol: string;
  side: string;
  entry: number;
  stop: number;
  tp1: number;
  tp2: number;
  score: number;
  confidence: number | null;
  strategy: string | null;
  timeframe: string | null;
  generatedAt: string;
  telegramDispatchStatus: string | null;
  telegramDispatchedAt: string | null;
  telegramDispatchReason: string | null;
};

type SignalRoomPayload = {
  summary: {
    openCount: number;
    closedCount: number;
    winCount: number;
    lossCount: number;
    partialWinCount: number;
    latestSignalTimestamp: string | null;
  };
  reconciliation: {
    cycleId: string | null;
    currentCycle: {
      candidatesEvaluatedThisCycle: number;
      signalsPersistedThisCycle: number;
      telegramSignalsDispatchedThisCycle: number;
      signalsSkippedThisCycle: number;
    };
    persistedTotals: {
      totalOpenSignals: number;
      totalClosedSignals: number;
      totalResolvedSignals: number;
      totalTelegramDispatchRecords: number;
      totalPersistedSignals: number;
    };
  };
  cycleTruth: {
    allowedSymbolsConfigured: string[];
    symbolsActuallyScanned: string[];
    symbolsSkippedBeforeEvaluation: string[];
    candidatesRejectedBy: Record<string, number>;
    closedSignalsThisCycle: number;
    maxConcurrentBlockedThisCycle: boolean;
    maxConcurrentBlockedCount: number;
  } | null;
  controlPlane: {
    allowedSymbolsConfiguredDefaults: string[];
    allowedSymbolsRuntime: string[];
    allowedSymbolsRuntimeCount: number;
    activeMode: string;
    isRunning: boolean;
  };
  capitalAllocation: {
    paperMaxConcurrentPositions: number;
    currentOpenPositionsCount: number;
    currentAvailablePaperCapital: number;
    availableRiskBudget: number;
    blockedByMaxConcurrentRulesThisCycle: boolean;
  };
  liveView: {
    openSignalsVisibleInSignalRoom: number;
    recentGeneratedSignalsVisible: number;
    recentClosedSignalsVisible: number;
  };
  dispatchBreakdown: {
    openTradesFromPersistedSignals: number;
    openTradesWithTelegramDispatch: number;
    openTradesWithoutTelegramDispatch: number;
  };
  restartPolicy: {
    configuredPolicy: "resume_persisted" | "reset_signal_mode_state_on_boot";
    resetOnBoot: boolean;
    resumedFromPersistedDb: boolean;
    lastResetAt: string | null;
    lastResumeAt: string | null;
  };
  paperModel: {
    equity: number;
    riskPct: number;
    leverage: number;
    maxConcurrentPositions: number;
    minTier: string;
    minTp2R: number;
    symbolCooldownMinutes: number;
    maxEntryStretchAtr: number;
    partialAtTp1Enabled: boolean;
    partialPct: number;
    tp1ProtectMode: string;
    tp1ProtectOffsetR: number;
    breakevenBufferR: number;
  };
  openTrades: SignalTrade[];
  closedTrades: SignalTrade[];
  recentSignals: SignalEvent[];
};

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded border border-slate-800 bg-slate-900/70 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-xl font-semibold text-slate-100">{value}</p>
    </div>
  );
}

function toneForOutcome(outcome: string | null) {
  if (outcome === "win") return "text-emerald-300";
  if (outcome === "loss") return "text-rose-300";
  if (outcome === "partial_win") return "text-amber-300";
  return "text-slate-300";
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
    <section className="space-y-5">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Signal Room</h1>
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
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="Current cycle candidates" value={data.reconciliation.currentCycle.candidatesEvaluatedThisCycle} />
            <SummaryCard label="Current cycle persisted" value={data.reconciliation.currentCycle.signalsPersistedThisCycle} />
            <SummaryCard label="Current cycle Telegram dispatched" value={data.reconciliation.currentCycle.telegramSignalsDispatchedThisCycle} />
            <SummaryCard label="Current cycle skipped" value={data.reconciliation.currentCycle.signalsSkippedThisCycle} />
          </section>
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="Allowed symbols active" value={data.controlPlane.allowedSymbolsRuntimeCount} />
            <SummaryCard label="Scanned this cycle" value={data.cycleTruth?.symbolsActuallyScanned.length ?? 0} />
            <SummaryCard label="Closed this cycle" value={data.cycleTruth?.closedSignalsThisCycle ?? 0} />
            <SummaryCard label="Max concurrent blocked" value={data.cycleTruth?.maxConcurrentBlockedCount ?? 0} />
          </section>

          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <SummaryCard label="Persisted open" value={data.reconciliation.persistedTotals.totalOpenSignals} />
            <SummaryCard label="Persisted closed" value={data.reconciliation.persistedTotals.totalClosedSignals} />
            <SummaryCard label="Persisted resolved outcomes" value={data.reconciliation.persistedTotals.totalResolvedSignals} />
            <SummaryCard label="Telegram records" value={data.reconciliation.persistedTotals.totalTelegramDispatchRecords} />
            <SummaryCard label="Total persisted signals" value={data.reconciliation.persistedTotals.totalPersistedSignals} />
          </section>

          <section className="rounded border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-300">
            <h2 className="text-lg font-semibold text-slate-100">Signal Mode Settings / Paper Model</h2>
            <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              <p>Restart policy: <span className="font-medium">{data.restartPolicy.configuredPolicy}</span></p>
              <p>Resumed from persisted DB: <span className="font-medium">{String(data.restartPolicy.resumedFromPersistedDb)}</span></p>
              <p>Paper equity: <span className="font-medium">{data.paperModel.equity}</span></p>
              <p>Paper risk %: <span className="font-medium">{(data.paperModel.riskPct * 100).toFixed(2)}%</span></p>
              <p>Paper leverage: <span className="font-medium">{data.paperModel.leverage}x</span></p>
              <p>Leverage meaning: <span className="font-medium">Configured cap only; effective leverage = notional / equity</span></p>
              <p>Max concurrent positions: <span className="font-medium">{data.paperModel.maxConcurrentPositions}</span></p>
              <p>Open positions now: <span className="font-medium">{data.capitalAllocation.currentOpenPositionsCount}</span></p>
              <p>Available paper capital: <span className="font-medium">{data.capitalAllocation.currentAvailablePaperCapital.toFixed(2)}</span></p>
              <p>Available risk budget: <span className="font-medium">{data.capitalAllocation.availableRiskBudget.toFixed(2)}</span></p>
              <p>Blocked by max concurrent this cycle: <span className="font-medium">{String(data.capitalAllocation.blockedByMaxConcurrentRulesThisCycle)}</span></p>
              <p>Runtime allowed symbols: <span className="font-medium">{data.controlPlane.allowedSymbolsRuntime.join(", ") || "-"}</span></p>
              <p>Configured default symbols: <span className="font-medium">{data.controlPlane.allowedSymbolsConfiguredDefaults.join(", ") || "-"}</span></p>
              <p>Min tier: <span className="font-medium">{data.paperModel.minTier}</span></p>
              <p>Min TP2 R: <span className="font-medium">{data.paperModel.minTp2R}</span></p>
              <p>Cooldown (min): <span className="font-medium">{data.paperModel.symbolCooldownMinutes}</span></p>
              <p>Entry stretch ATR cap: <span className="font-medium">{data.paperModel.maxEntryStretchAtr}</span></p>
              <p>Partial TP1 enabled: <span className="font-medium">{String(data.paperModel.partialAtTp1Enabled)}</span></p>
              <p>Partial at TP1 %: <span className="font-medium">{(data.paperModel.partialPct * 100).toFixed(0)}%</span></p>
            </div>
          </section>

          <section className="rounded border border-slate-800 bg-slate-900/70 p-4">
            <header className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Open Paper Trades</h2>
              <p className="text-xs text-slate-400">Persisted open positions with sizing + Telegram dispatch truth</p>
            </header>
            <div className="overflow-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="text-slate-400">
                    <th className="px-2 py-1">Symbol</th><th className="px-2 py-1">Entry</th><th className="px-2 py-1">Stop</th><th className="px-2 py-1">TP1/TP2</th>
                    <th className="px-2 py-1">Qty</th><th className="px-2 py-1">Notional</th><th className="px-2 py-1">Risk</th><th className="px-2 py-1">Lev</th>
                    <th className="px-2 py-1">PnL / R</th><th className="px-2 py-1">Telegram</th><th className="px-2 py-1">Opened</th>
                  </tr>
                </thead>
                <tbody>
                  {data.openTrades.map((trade) => (
                    <tr key={trade.id} className="border-t border-slate-800">
                      <td className="px-2 py-1">{trade.symbol} {trade.side}</td>
                      <td className="px-2 py-1">{trade.entryPrice.toFixed(6)}</td>
                      <td className="px-2 py-1">{trade.stopPrice.toFixed(6)}</td>
                      <td className="px-2 py-1">{trade.tp1Price.toFixed(6)} / {trade.tp2Price.toFixed(6)}</td>
                      <td className="px-2 py-1">{(trade.quantity ?? 0).toFixed(6)}</td>
                      <td className="px-2 py-1">{(trade.paperComputed?.notionalQuote ?? trade.notional ?? 0).toFixed(2)}</td>
                      <td className="px-2 py-1">{((trade.paperComputed?.positionRiskPct ?? trade.riskPct ?? 0) * 100).toFixed(2)}% ({(trade.paperComputed?.riskAmountQuote ?? trade.riskAmount ?? 0).toFixed(2)})</td>
                      <td className="px-2 py-1">
                        cap {(trade.paperComputed?.configuredLeverageCap ?? trade.leverage ?? 0).toFixed(2)}x / eff {(trade.paperComputed?.effectiveLeverage ?? 0).toFixed(2)}x
                      </td>
                      <td className="px-2 py-1">{(trade.paperComputed?.unrealizedPnlQuote ?? trade.unrealizedPnl ?? 0).toFixed(6)} / {(trade.paperComputed?.rResultOpen ?? 0).toFixed(2)}R</td>
                      <td className="px-2 py-1">{trade.telegramDispatchStatus} ({trade.telegramDispatchReason ?? "-"})</td>
                      <td className="px-2 py-1">{new Date(trade.openedAt).toISOString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded border border-slate-800 bg-slate-900/70 p-4">
            <h2 className="text-lg font-semibold">Closed Paper Trades</h2>
            <div className="overflow-auto mt-3">
              <table className="min-w-full text-left text-sm">
                <thead><tr className="text-slate-400"><th className="px-2 py-1">Symbol</th><th className="px-2 py-1">Outcome</th><th className="px-2 py-1">Realized PnL / R</th><th className="px-2 py-1">Lev cap/eff</th><th className="px-2 py-1">Closed At</th></tr></thead>
                <tbody>
                  {data.closedTrades.map((trade) => (
                    <tr key={trade.id} className="border-t border-slate-800">
                      <td className="px-2 py-1">{trade.symbol} {trade.side}</td>
                      <td className={`px-2 py-1 ${toneForOutcome(trade.outcome)}`}>{trade.outcome ?? "-"}</td>
                      <td className="px-2 py-1">{(trade.paperComputed?.realizedPnlQuote ?? trade.realizedPnl ?? 0).toFixed(6)} / {(trade.paperComputed?.rResultClosed ?? 0).toFixed(2)}R</td>
                      <td className="px-2 py-1">cap {(trade.paperComputed?.configuredLeverageCap ?? 0).toFixed(2)}x / eff {(trade.paperComputed?.effectiveLeverage ?? 0).toFixed(2)}x</td>
                      <td className="px-2 py-1">{trade.closedAt ? new Date(trade.closedAt).toISOString() : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded border border-slate-800 bg-slate-900/70 p-4">
            <h2 className="text-lg font-semibold">Recent Generated Signals</h2>
            <p className="text-xs text-slate-400">Persisted signals; Telegram dispatch shown per signal.</p>
            <div className="overflow-auto mt-3">
              <table className="min-w-full text-left text-sm">
                <thead><tr className="text-slate-400"><th className="px-2 py-1">Symbol</th><th className="px-2 py-1">Score</th><th className="px-2 py-1">Telegram</th><th className="px-2 py-1">Reason</th><th className="px-2 py-1">Generated At</th></tr></thead>
                <tbody>
                  {data.recentSignals.map((signal) => (
                    <tr key={signal.id} className="border-t border-slate-800">
                      <td className="px-2 py-1">{signal.symbol} {signal.side}</td>
                      <td className="px-2 py-1">{signal.score.toFixed(2)}</td>
                      <td className="px-2 py-1">{signal.telegramDispatchStatus ?? "n/a"}</td>
                      <td className="px-2 py-1">{signal.telegramDispatchReason ?? "-"}</td>
                      <td className="px-2 py-1">{new Date(signal.generatedAt).toISOString()}</td>
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
              <p className="mt-2 text-sm">Allowed symbols configured: {data.cycleTruth.allowedSymbolsConfigured.join(", ") || "-"}</p>
              <p className="text-sm">Symbols scanned: {data.cycleTruth.symbolsActuallyScanned.join(", ") || "-"}</p>
              <p className="text-sm">Skipped before evaluation: {data.cycleTruth.symbolsSkippedBeforeEvaluation.join(", ") || "-"}</p>
              <ul className="mt-3 space-y-1 text-sm text-slate-300">
                {Object.entries(data.cycleTruth.candidatesRejectedBy).map(([reason, count]) => (
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
