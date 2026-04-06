"use client";

import { useEffect, useState } from "react";

type SignalTrade = {
  id: string;
  signalEventId: string;
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
};

type SignalEvent = {
  id: string;
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
};

type SignalRoomPayload = {
  summary: {
    openCount: number;
    closedCount: number;
    winCount: number;
    lossCount: number;
    partialWinCount: number;
  };
  openTrades: SignalTrade[];
  closedTrades: SignalTrade[];
  recentSignals: SignalEvent[];
};

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-slate-800 bg-slate-900/70 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-100">{value}</p>
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

  useEffect(() => {
    let mounted = true;

    fetch("/api/signal-room")
      .then(async (res) => {
        if (!res.ok) {
          const payload = (await res.json().catch(() => null)) as { message?: string } | null;
          throw new Error(payload?.message ?? `Request failed (${res.status})`);
        }
        return res.json() as Promise<SignalRoomPayload>;
      })
      .then((payload) => {
        if (!mounted) return;
        setData(payload);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!mounted) return;
        setData(null);
        setError(err instanceof Error ? err.message : "Unable to load signal room data");
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <section className="space-y-5">
      <header>
        <h1 className="text-3xl font-bold">Signal Room</h1>
        <p className="mt-1 text-sm text-slate-400">Signal-mode paper lifecycle with persisted trades, closed outcomes, and recent generated signals.</p>
      </header>

      {loading && <p className="rounded border border-slate-800 bg-slate-900/70 p-3 text-sm text-slate-300">Loading signal room…</p>}
      {error && <p className="rounded border border-rose-700/50 bg-rose-900/20 p-3 text-sm text-rose-200">{error}</p>}

      {data && (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <SummaryCard label="Open Trades" value={data.summary.openCount} />
            <SummaryCard label="Closed Trades" value={data.summary.closedCount} />
            <SummaryCard label="Wins" value={data.summary.winCount} />
            <SummaryCard label="Losses" value={data.summary.lossCount} />
            <SummaryCard label="Partial Wins" value={data.summary.partialWinCount} />
          </div>

          <section className="rounded border border-slate-800 bg-slate-900/70 p-4">
            <header className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Open Paper Trades</h2>
              <p className="text-xs text-slate-400">Persisted signal-mode lifecycle</p>
            </header>
            <div className="overflow-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="text-slate-400">
                    <th className="px-2 py-1">Symbol</th>
                    <th className="px-2 py-1">Side</th>
                    <th className="px-2 py-1">Entry</th>
                    <th className="px-2 py-1">Current</th>
                    <th className="px-2 py-1">Stop</th>
                    <th className="px-2 py-1">TP1</th>
                    <th className="px-2 py-1">TP2</th>
                    <th className="px-2 py-1">Status</th>
                    <th className="px-2 py-1">Unrealized PnL</th>
                    <th className="px-2 py-1">Opened At</th>
                  </tr>
                </thead>
                <tbody>
                  {data.openTrades.map((trade) => (
                    <tr key={trade.id} className="border-t border-slate-800">
                      <td className="px-2 py-1">{trade.symbol}</td>
                      <td className="px-2 py-1">{trade.side}</td>
                      <td className="px-2 py-1">{trade.entryPrice.toFixed(6)}</td>
                      <td className="px-2 py-1">{trade.currentPrice?.toFixed(6) ?? "-"}</td>
                      <td className="px-2 py-1">{trade.stopPrice.toFixed(6)}</td>
                      <td className="px-2 py-1">{trade.tp1Price.toFixed(6)}</td>
                      <td className="px-2 py-1">{trade.tp2Price.toFixed(6)}</td>
                      <td className="px-2 py-1">{trade.status}</td>
                      <td className="px-2 py-1">{(trade.unrealizedPnl ?? 0).toFixed(6)}</td>
                      <td className="px-2 py-1">{new Date(trade.openedAt).toISOString()}</td>
                    </tr>
                  ))}
                  {data.openTrades.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-2 py-3 text-slate-400">
                        No open signal trades yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded border border-slate-800 bg-slate-900/70 p-4">
            <header className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Closed Paper Trades</h2>
              <p className="text-xs text-slate-400">Closed outcomes tracked from worker lifecycle</p>
            </header>
            <div className="overflow-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="text-slate-400">
                    <th className="px-2 py-1">Symbol</th>
                    <th className="px-2 py-1">Side</th>
                    <th className="px-2 py-1">Entry</th>
                    <th className="px-2 py-1">Final Price</th>
                    <th className="px-2 py-1">Status</th>
                    <th className="px-2 py-1">Outcome</th>
                    <th className="px-2 py-1">Realized PnL</th>
                    <th className="px-2 py-1">Opened At</th>
                    <th className="px-2 py-1">Closed At</th>
                  </tr>
                </thead>
                <tbody>
                  {data.closedTrades.map((trade) => (
                    <tr key={trade.id} className="border-t border-slate-800">
                      <td className="px-2 py-1">{trade.symbol}</td>
                      <td className="px-2 py-1">{trade.side}</td>
                      <td className="px-2 py-1">{trade.entryPrice.toFixed(6)}</td>
                      <td className="px-2 py-1">{trade.currentPrice?.toFixed(6) ?? "-"}</td>
                      <td className="px-2 py-1">{trade.status}</td>
                      <td className={`px-2 py-1 ${toneForOutcome(trade.outcome)}`}>{trade.outcome ?? "-"}</td>
                      <td className="px-2 py-1">{(trade.realizedPnl ?? 0).toFixed(6)}</td>
                      <td className="px-2 py-1">{new Date(trade.openedAt).toISOString()}</td>
                      <td className="px-2 py-1">{trade.closedAt ? new Date(trade.closedAt).toISOString() : "-"}</td>
                    </tr>
                  ))}
                  {data.closedTrades.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-2 py-3 text-slate-400">
                        No closed signal trades yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded border border-slate-800 bg-slate-900/70 p-4">
            <header className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Recent Generated Signals</h2>
              <p className="text-xs text-slate-400">Latest 50 persisted signal events</p>
            </header>
            <div className="overflow-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="text-slate-400">
                    <th className="px-2 py-1">Symbol</th>
                    <th className="px-2 py-1">Side</th>
                    <th className="px-2 py-1">Entry</th>
                    <th className="px-2 py-1">Stop</th>
                    <th className="px-2 py-1">TP1</th>
                    <th className="px-2 py-1">TP2</th>
                    <th className="px-2 py-1">Score</th>
                    <th className="px-2 py-1">Confidence</th>
                    <th className="px-2 py-1">Strategy</th>
                    <th className="px-2 py-1">Timeframe</th>
                    <th className="px-2 py-1">Generated At</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentSignals.map((signal) => (
                    <tr key={signal.id} className="border-t border-slate-800">
                      <td className="px-2 py-1">{signal.symbol}</td>
                      <td className="px-2 py-1">{signal.side}</td>
                      <td className="px-2 py-1">{signal.entry.toFixed(6)}</td>
                      <td className="px-2 py-1">{signal.stop.toFixed(6)}</td>
                      <td className="px-2 py-1">{signal.tp1.toFixed(6)}</td>
                      <td className="px-2 py-1">{signal.tp2.toFixed(6)}</td>
                      <td className="px-2 py-1">{signal.score.toFixed(2)}</td>
                      <td className="px-2 py-1">{signal.confidence === null ? "-" : `${(signal.confidence * 100).toFixed(1)}%`}</td>
                      <td className="px-2 py-1">{signal.strategy ?? "-"}</td>
                      <td className="px-2 py-1">{signal.timeframe ?? "-"}</td>
                      <td className="px-2 py-1">{new Date(signal.generatedAt).toISOString()}</td>
                    </tr>
                  ))}
                  {data.recentSignals.length === 0 && (
                    <tr>
                      <td colSpan={11} className="px-2 py-3 text-slate-400">
                        No persisted signals yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </section>
  );
}
