"use client";

import { useEffect, useState } from "react";

type Group = { key: string; profitFactor: number; tradeCount: number };
type AnalyticsPayload = {
  analytics: {
    byRegime: Group[];
    byScoreBucket: Group[];
  };
};

export default function Page() {
  const [data, setData] = useState<AnalyticsPayload | null>(null);

  useEffect(() => {
    fetch("/api/backtests/latest")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => setData(json))
      .catch(() => setData(null));
  }, []);

  return (
    <section className="space-y-4">
      <h1 className="text-3xl font-bold">Analytics</h1>
      <p className="text-slate-300">Regime + score analytics from latest backtest run.</p>

      <div className="rounded border border-slate-800 bg-slate-900 p-4">
        <h2 className="mb-2 font-semibold">Regime Breakdown (PF)</h2>
        <ul className="space-y-1 text-sm text-slate-300">
          {(data?.analytics.byRegime ?? []).map((item) => (
            <li key={item.key}>
              {item.key}: PF {item.profitFactor.toFixed(2)} ({item.tradeCount} trades)
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded border border-slate-800 bg-slate-900 p-4">
        <h2 className="mb-2 font-semibold">Score Distribution</h2>
        <ul className="space-y-1 text-sm text-slate-300">
          {(data?.analytics.byScoreBucket ?? []).map((item) => (
            <li key={item.key}>
              {item.key}: PF {item.profitFactor.toFixed(2)} ({item.tradeCount} trades)
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
