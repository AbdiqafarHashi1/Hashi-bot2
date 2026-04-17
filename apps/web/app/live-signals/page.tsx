"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

  return (
    <section className="space-y-4 sm:space-y-5">
      <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Signal Mode Live Operator Console</h1>
          <p className="mt-1 text-sm text-slate-400">Live signal runtime, cycle state, symbol scan board, execution and Telegram visibility.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded border border-slate-700 px-3 py-2 text-xs text-slate-100 hover:bg-slate-800/50"
            onClick={() => void load(true)}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing…" : "Manual refresh"}
          </button>
          <button
            className={`rounded border px-3 py-2 text-xs ${autoRefresh ? "border-emerald-700/60 text-emerald-200" : "border-slate-700 text-slate-300"}`}
            onClick={() => setAutoRefresh((prev) => !prev)}
          >
            Auto-refresh: {autoRefresh ? "ON" : "OFF"}
          </button>
          <button
            className="rounded border border-rose-700/60 px-3 py-2 text-xs text-rose-200 hover:bg-rose-900/30 disabled:opacity-50"
            onClick={() => void runReset()}
            disabled={resetBusy}
          >
            {resetBusy ? "Resetting…" : "Reset signal-mode open state"}
          </button>
        </div>
      </header>

      <section className="rounded-lg border border-slate-700/50 bg-slate-900/40 p-3 text-xs text-slate-300">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <span>Refresh cadence: {AUTO_REFRESH_MS / 1000}s</span>
          <span>Last updated: {formatIso(lastUpdatedAt)}</span>
          <span>Runtime feed: {data?.liveRuntimeEvents.length ?? 0} recent persisted events</span>
        </div>
      </section>

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
          <section className="rounded-lg border border-cyan-700/40 bg-cyan-950/10 p-4 sm:p-5">
            <h2 className="mb-3 text-lg font-semibold">Live Runtime Feed (newest first)</h2>
            <div className={tableWrapperClass}>
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th className={headerCellClass}>At</th>
                    <th className={headerCellClass}>Event</th>
                    <th className={headerCellClass}>Cycle</th>
                    <th className={headerCellClass}>Symbol / Market</th>
                    <th className={headerCellClass}>Engine / Strategy</th>
                    <th className={headerCellClass}>Result / Reason</th>
                    <th className={headerCellClass}>Summary</th>
                  </tr>
                </thead>
                <tbody>
                  {data.liveRuntimeEvents.map((event) => (
                    <tr key={event.id} className="border-t border-cyan-900/30">
                      <td className={textCellClass}>{formatIso(event.at)}</td>
                      <td className={textCellClass}>{event.eventType}</td>
                      <td className={textCellClass}>{event.cycleNumber ?? event.cycleId ?? "-"}</td>
                      <td className={textCellClass}>{event.symbol ? `${event.symbol} ${event.marketType ? `(${event.marketType})` : ""}` : "-"}</td>
                      <td className={textCellClass}>{event.engineId ?? "-"} / {event.strategyId ?? "-"}</td>
                      <td className={textCellClass}>{event.result ?? "-"} {event.reason ? `• ${event.reason}` : ""}</td>
                      <td className={`${textCellClass} max-w-[360px] whitespace-normal break-words`}>{event.summary ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-lg border border-violet-700/40 bg-violet-950/10 p-4 sm:p-5 space-y-3">
            <h2 className="text-lg font-semibold">Current Cycle Live</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryCard label="Cycle" value={data.currentCycleLive.cycleNumber?.toString() ?? data.currentCycleLive.cycleId ?? "-"} />
              <SummaryCard label="Cycle started" value={formatIso(data.currentCycleLive.cycleStartedAt)} />
              <SummaryCard label="Symbols total" value={String(data.currentCycleLive.symbolsTotal)} />
              <SummaryCard label="Symbols ready / blocked" value={`${data.currentCycleLive.symbolsReady} / ${data.currentCycleLive.symbolsBlocked}`} />
              <SummaryCard label="Dispatched to scan" value={String(data.currentCycleLive.symbolsDispatchedToScan)} />
              <SummaryCard label="Engine scan attempts" value={String(data.currentCycleLive.engineScanAttempts)} />
              <SummaryCard label="Candidates gen / rej / sel" value={`${data.currentCycleLive.candidatesGenerated} / ${data.currentCycleLive.candidatesRejected} / ${data.currentCycleLive.candidatesSelected}`} />
              <SummaryCard label="Paper executed / Telegram sent" value={`${data.currentCycleLive.paperExecuted} / ${data.currentCycleLive.telegramSent}`} />
            </div>
            <div className={tableWrapperClass}>
              <table className="min-w-[760px] w-full text-left text-sm">
                <thead>
                  <tr>
                    <th className={headerCellClass}>Engine</th>
                    <th className={headerCellClass}>Scans</th>
                    <th className={headerCellClass}>Generated</th>
                    <th className={headerCellClass}>Rejected</th>
                    <th className={headerCellClass}>No setup</th>
                    <th className={headerCellClass}>Blocked</th>
                    <th className={headerCellClass}>Skipped</th>
                    <th className={headerCellClass}>Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {(["engine1", "engine2", "engine3", "engine4"] as const).map((engine) => {
                    const row = data.currentCycleLive.engineBreakdown[engine] ?? {
                      scansAttempted: 0, candidateGenerated: 0, candidateRejected: 0, noSetup: 0, blocked: 0, skipped: 0, errors: 0
                    };
                    return (
                      <tr key={engine} className="border-t border-violet-900/30">
                        <td className={textCellClass}>{engine.toUpperCase()}</td>
                        <td className={numericCellClass}>{row.scansAttempted}</td>
                        <td className={numericCellClass}>{row.candidateGenerated}</td>
                        <td className={numericCellClass}>{row.candidateRejected}</td>
                        <td className={numericCellClass}>{row.noSetup}</td>
                        <td className={numericCellClass}>{row.blocked}</td>
                        <td className={numericCellClass}>{row.skipped}</td>
                        <td className={numericCellClass}>{row.errors}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-lg border border-teal-700/40 bg-teal-950/10 p-4 sm:p-5">
            <h2 className="mb-3 text-lg font-semibold">Per-Symbol Live Scan Board</h2>
            <div className={tableWrapperClass}>
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th className={headerCellClass}>Market</th>
                    <th className={headerCellClass}>Symbol</th>
                    <th className={headerCellClass}>Preload / Context</th>
                    <th className={headerCellClass}>Blocked reason</th>
                    <th className={headerCellClass}>Engine1</th>
                    <th className={headerCellClass}>Engine2</th>
                    <th className={headerCellClass}>Engine3</th>
                    <th className={headerCellClass}>Engine4</th>
                    <th className={headerCellClass}>Candidate / Selected</th>
                    <th className={headerCellClass}>Paper / Telegram</th>
                  </tr>
                </thead>
                <tbody>
                  {data.symbolScanBoard
                    .filter((entry) => activeView === "all" || entry.marketType === activeView)
                    .map((entry) => (
                      <tr key={`${entry.marketType}-${entry.symbol}`} className="border-t border-teal-900/30">
                        <td className={textCellClass}><span className={badgeClass(entry.marketType)}>{entry.marketType}</span></td>
                        <td className={textCellClass}>{entry.symbol}</td>
                        <td className={textCellClass}>{statusTag(entry.preloadStatus, entry.preloadStatus === "context_ready" ? "ok" : "warn")} {statusTag(entry.contextStatus, entry.contextStatus === "ready" ? "ok" : "warn")}</td>
                        <td className={`${textCellClass} max-w-[260px] whitespace-normal break-words`}>{entry.blockedReason ?? "-"}</td>
                        {(["engine1", "engine2", "engine3", "engine4"] as const).map((engine) => {
                          const e = entry.engineResults[engine];
                          return <td key={`${entry.symbol}-${engine}`} className={textCellClass}>{e ? `${e.result}${e.reason ? ` (${e.reason})` : ""}` : "-"}</td>;
                        })}
                        <td className={textCellClass}>{entry.candidateGenerated ? statusTag("candidate", "ok") : statusTag("none", "neutral")} {entry.selected ? statusTag("selected", "ok") : statusTag("rejected", "warn")}</td>
                        <td className={textCellClass}>{entry.paperExecuted ? statusTag("paper", "ok") : statusTag("paper_no", "warn")} {entry.telegramSent ? statusTag("telegram", "ok") : statusTag("telegram_no", "warn")}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-lg border border-sky-700/30 bg-sky-950/10 p-4 sm:p-5">
            <h2 className="mb-3 text-lg font-semibold">Open Positions (live lifecycle view)</h2>
            <div className={tableWrapperClass}>
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th className={headerCellClass}>Market</th>
                    <th className={headerCellClass}>Symbol</th>
                    <th className={headerCellClass}>Status</th>
                    <th className={headerCellClass}>Entry time</th>
                    <th className={headerCellClass}>Entry / Mark</th>
                    <th className={headerCellClass}>Unrealized PnL</th>
                    <th className={headerCellClass}>Remaining qty</th>
                    <th className={headerCellClass}>Stop / TP state</th>
                    <th className={headerCellClass}>Last lifecycle event</th>
                    <th className={headerCellClass}>Reasoning</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.open.map((position) => {
                    const reasonParts = reasoningItems(position.reasoning);
                    return (
                      <tr key={position.id} className="border-t border-sky-900/40">
                        <td className={textCellClass}><span className={badgeClass(position.marketType)}>{position.marketType}</span></td>
                        <td className={textCellClass}>{position.symbol} {position.side}</td>
                        <td className={textCellClass}>{statusTag(position.status === "partially_closed" ? "TP1_HIT" : "OPEN", position.status === "partially_closed" ? "warn" : "ok")}</td>
                        <td className={textCellClass}>{formatIso(position.openedAt)}</td>
                        <td className={numericCellClass}>{formatPrice(position.entryPrice)} / {formatPrice(position.markPrice)}</td>
                        <td className={`${numericCellClass} ${toneForPnl(position.unrealizedPnl)}`}>{formatMoney(position.unrealizedPnl)}</td>
                        <td className={numericCellClass}>{formatQty(position.qty)}</td>
                        <td className={textCellClass}>SL {formatPrice(position.stopPrice)} / TP1 {formatPrice(position.tp1Price)} / TP2 {formatPrice(position.tp2Price)}</td>
                        <td className={textCellClass}>{position.lastLifecycleEvent ?? "-"}<div className="text-xs text-slate-500">{formatIso(position.lastLifecycleEventAt ?? null)}</div></td>
                        <td className={textCellClass}>
                          {reasonParts.length > 0 ? (
                            <div className="flex flex-wrap gap-1">{reasonParts.map(([k, v]) => scoreBadge(k, v.toFixed(1)))}</div>
                          ) : (
                            <span className="text-slate-500">{position.selectedReason ?? "no structured reasoning"}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-emerald-700/40 bg-emerald-950/10 p-4 sm:p-5">
              <h2 className="mb-3 text-lg font-semibold">Current Cycle — Selected</h2>
              <div className={tableWrapperClass}><table className="min-w-[740px] w-full text-left text-sm"><thead><tr><th className={headerCellClass}>Rank</th><th className={headerCellClass}>Market</th><th className={headerCellClass}>Symbol</th><th className={headerCellClass}>Score</th><th className={headerCellClass}>Engine / Strategy</th><th className={headerCellClass}>Why selected</th></tr></thead><tbody>
                {filtered.selected.map((entry) => (
                  <tr key={`${entry.marketType}-${entry.symbol}-${entry.rank}`} className="border-t border-emerald-900/40"><td className={numericCellClass}>{entry.rank}</td><td className={textCellClass}><span className={badgeClass(entry.marketType)}>{entry.marketType}</span></td><td className={textCellClass}>{entry.symbol} {entry.side}</td><td className={numericCellClass}>{entry.score.toFixed(2)}</td><td className={textCellClass}>{entry.engineLabel ?? entry.engineId ?? "-"} / {entry.strategyLabel ?? entry.strategyId ?? "-"}</td><td className={`${textCellClass} max-w-[360px] whitespace-normal break-words`}>{entry.selectedReason}</td></tr>
                ))}
              </tbody></table></div>
            </div>
            <div className="rounded-lg border border-amber-700/40 bg-amber-950/10 p-4 sm:p-5">
              <h2 className="mb-3 text-lg font-semibold">Current Cycle — Rejected</h2>
              <div className={tableWrapperClass}><table className="min-w-[740px] w-full text-left text-sm"><thead><tr><th className={headerCellClass}>Rank</th><th className={headerCellClass}>Market</th><th className={headerCellClass}>Symbol</th><th className={headerCellClass}>Score</th><th className={headerCellClass}>Engine / Strategy</th><th className={headerCellClass}>Why rejected</th></tr></thead><tbody>
                {filtered.rejected.map((entry) => (
                  <tr key={`${entry.marketType}-${entry.symbol}-${entry.rank}`} className="border-t border-amber-900/40"><td className={numericCellClass}>{entry.rank}</td><td className={textCellClass}><span className={badgeClass(entry.marketType)}>{entry.marketType}</span></td><td className={textCellClass}>{entry.symbol} {entry.side}</td><td className={numericCellClass}>{entry.score.toFixed(2)}</td><td className={textCellClass}>{entry.engineLabel ?? entry.engineId ?? "-"} / {entry.strategyLabel ?? entry.strategyId ?? "-"}</td><td className={`${textCellClass} max-w-[360px] whitespace-normal break-words`}>{entry.rejectionReason ?? "-"}</td></tr>
                ))}
              </tbody></table></div>
            </div>
          </section>

          <section className="rounded-lg border border-slate-700/40 bg-slate-900/60 p-4 sm:p-5">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-lg font-semibold">Signal Lifecycle Trail</h2>
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
                  <p>Symbol: <span className="font-medium">{inspected.symbol} {inspected.side}</span></p>
                  <p>Status: <span className="font-medium">{inspected.status}</span></p>
                  <p>Selected reason: <span className="font-medium">{inspected.selectedReason ?? "-"}</span></p>
                  <p>Rejected/close reason: <span className="font-medium">{inspected.rejectedReason ?? inspected.closeReason ?? "-"}</span></p>
                </div>
                <div className={tableWrapperClass}>
                  <table className="min-w-[760px] w-full text-left text-sm">
                    <thead><tr><th className={headerCellClass}>At</th><th className={headerCellClass}>Status</th><th className={headerCellClass}>Close reason</th><th className={headerCellClass}>Price</th><th className={headerCellClass}>Remaining qty</th><th className={headerCellClass}>Stop</th></tr></thead>
                    <tbody>
                      {inspectedLifecycle.map((event, index) => (
                        <tr key={`${event.createdAt}-${index}`} className="border-t border-slate-800/70">
                          <td className={textCellClass}>{formatIso(event.createdAt)}</td>
                          <td className={textCellClass}>{event.status ?? "-"}</td>
                          <td className={textCellClass}>{event.closeReason ?? "-"}</td>
                          <td className={numericCellClass}>{event.currentPrice === null ? "-" : formatPrice(event.currentPrice)}</td>
                          <td className={numericCellClass}>{event.remainingQty === null ? "-" : formatQty(event.remainingQty)}</td>
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
