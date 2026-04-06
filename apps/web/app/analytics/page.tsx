"use client";

import { useEffect, useState } from "react";

type SignalRoomPayload = {
  summary: {
    openCount: number;
    closedCount: number;
    winCount: number;
    lossCount: number;
    partialWinCount: number;
  };
  recentSignals: Array<{ generatedAt: string }>;
};

type BacktestGroup = { key: string; profitFactor: number; tradeCount: number };
type BacktestPayload = {
  analytics: {
    byRegime: BacktestGroup[];
    byScoreBucket: BacktestGroup[];
  };
};

export default function Page() {
  const [signalData, setSignalData] = useState<SignalRoomPayload | null>(null);
  const [backtestData, setBacktestData] = useState<BacktestPayload | null>(null);

  useEffect(() => {
    fetch("/api/signal-room")
      .then((res) => (res.ok ? (res.json() as Promise<SignalRoomPayload>) : null))
      .then((json) => setSignalData(json))
      .catch(() => setSignalData(null));

    fetch("/api/backtests/latest")
      .then((res) => (res.ok ? (res.json() as Promise<BacktestPayload>) : null))
      .then((json) => setBacktestData(json))
      .catch(() => setBacktestData(null));
  }, []);

  return (
    <section className="space-y-5">
      <header>
        <h1 className="text-3xl font-bold">Analytics</h1>
        <p className="mt-1 text-sm text-slate-400">Signal lifecycle analytics are available from persisted signal-room data. Personal and prop analytics pipelines are not yet available.</p>
      </header>

      <div className="rounded border border-slate-800 bg-slate-900/70 p-4">
        <h2 className="mb-2 font-semibold">Signal Analytics (Persisted)</h2>
        {signalData ? (
          <ul className="space-y-1 text-sm text-slate-300">
            <li>Open trades: {signalData.summary.openCount}</li>
            <li>Closed trades: {signalData.summary.closedCount}</li>
            <li>Wins: {signalData.summary.winCount}</li>
            <li>Losses: {signalData.summary.lossCount}</li>
            <li>Partial wins: {signalData.summary.partialWinCount}</li>
            <li>Latest signal: {signalData.recentSignals[0] ? new Date(signalData.recentSignals[0].generatedAt).toISOString() : "No signals yet"}</li>
          </ul>
        ) : (
          <p className="text-sm text-slate-400">Signal analytics unavailable.</p>
        )}
      </div>

      <div className="rounded border border-slate-800 bg-slate-900/70 p-4">
        <h2 className="mb-2 font-semibold">Personal Analytics</h2>
        <p className="text-sm text-slate-400">Not yet available: no persisted personal analytics pipeline has been implemented yet.</p>
      </div>

      <div className="rounded border border-slate-800 bg-slate-900/70 p-4">
        <h2 className="mb-2 font-semibold">Prop Analytics</h2>
        <p className="text-sm text-slate-400">Not yet available: no persisted prop analytics pipeline has been implemented yet.</p>
      </div>

      <div className="rounded border border-slate-800 bg-slate-900/70 p-4">
        <h2 className="mb-2 font-semibold">Historical Backtest Reference</h2>
        {backtestData ? (
          <div className="grid gap-4 md:grid-cols-2">
            <ul className="space-y-1 text-sm text-slate-300">
              <li className="font-medium text-slate-200">Regime Breakdown (PF)</li>
              {(backtestData.analytics.byRegime ?? []).map((item) => (
                <li key={`regime-${item.key}`}>{item.key}: PF {item.profitFactor.toFixed(2)} ({item.tradeCount} trades)</li>
              ))}
            </ul>
            <ul className="space-y-1 text-sm text-slate-300">
              <li className="font-medium text-slate-200">Score Distribution (PF)</li>
              {(backtestData.analytics.byScoreBucket ?? []).map((item) => (
                <li key={`score-${item.key}`}>{item.key}: PF {item.profitFactor.toFixed(2)} ({item.tradeCount} trades)</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-slate-400">No backtest artifact available.</p>
        )}
      </div>
    </section>
  );
}
