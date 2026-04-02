"use client";

import { useEffect, useState } from "react";

type BacktestPayload = {
  summary: {
    totalTrades: number;
    winRate: number;
    totalPnL: number;
  };
  trades: Array<{
    id: string;
    strategyModule: string;
    side: string;
    entryTime: number;
    exitTime: number;
    pnl: number;
  }>;
};

export default function Page() {
  const [data, setData] = useState<BacktestPayload | null>(null);

  useEffect(() => {
    fetch("/api/backtests/latest")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => setData(json))
      .catch(() => setData(null));
  }, []);

  return (
    <section className="space-y-4">
      <h1 className="text-3xl font-bold">Backtests</h1>
      <p className="text-slate-300">Phase 3 backtest summary placeholder.</p>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded border border-slate-800 bg-slate-900 p-4">Total trades: {data?.summary.totalTrades ?? 0}</div>
        <div className="rounded border border-slate-800 bg-slate-900 p-4">Win rate: {((data?.summary.winRate ?? 0) * 100).toFixed(2)}%</div>
        <div className="rounded border border-slate-800 bg-slate-900 p-4">PnL: {(data?.summary.totalPnL ?? 0).toFixed(2)}</div>
      </div>

      <div className="rounded border border-slate-800 bg-slate-900 p-4">
        <h2 className="mb-2 text-lg font-semibold">Trades</h2>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-slate-400">
              <th>ID</th>
              <th>Strategy</th>
              <th>Side</th>
              <th>Entry</th>
              <th>Exit</th>
              <th>PnL</th>
            </tr>
          </thead>
          <tbody>
            {(data?.trades ?? []).slice(0, 12).map((trade) => (
              <tr key={trade.id} className="border-t border-slate-800">
                <td>{trade.id}</td>
                <td>{trade.strategyModule}</td>
                <td>{trade.side}</td>
                <td>{new Date(trade.entryTime).toISOString()}</td>
                <td>{new Date(trade.exitTime).toISOString()}</td>
                <td>{trade.pnl.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
