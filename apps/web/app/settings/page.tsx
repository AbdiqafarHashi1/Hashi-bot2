"use client";

import { useEffect, useState } from "react";

type SettingsPayload = {
  generalSettings: {
    timezone?: string;
    theme?: string;
    engine?: {
      primaryLiveProvider?: string;
      backupLiveProvider?: string;
      symbol?: string;
      executionTimeframe?: string;
      htf1?: string;
      htf2?: string;
    };
  };
  riskSettings: Record<string, unknown>;
  strategySettings: Record<string, unknown>;
  telegramSettings: Record<string, unknown>;
};

export default function SettingsPage() {
  const [data, setData] = useState<SettingsPayload | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((json) => setData(json.settings))
      .catch(() => setData(null));
  }, []);

  const engine = data?.generalSettings?.engine;

  return (
    <section className="space-y-5">
      <header>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="mt-1 text-sm text-slate-400">DB-backed engine configuration and persisted settings snapshot.</p>
      </header>

      <div className="rounded border border-slate-800 bg-slate-900/70 p-4">
        <h2 className="mb-3 text-lg font-semibold">Engine Configuration</h2>
        <ul className="space-y-1 text-sm text-slate-300">
          <li>Primary provider: {engine?.primaryLiveProvider ?? "-"}</li>
          <li>Backup provider: {engine?.backupLiveProvider ?? "-"}</li>
          <li>Symbol: {engine?.symbol ?? "-"}</li>
          <li>Execution timeframe: {engine?.executionTimeframe ?? "-"}</li>
          <li>HTF1: {engine?.htf1 ?? "-"}</li>
          <li>HTF2: {engine?.htf2 ?? "-"}</li>
        </ul>
      </div>

      <pre className="overflow-auto rounded border border-slate-800 bg-slate-900/70 p-4 text-xs">
        {JSON.stringify(data, null, 2)}
      </pre>
    </section>
  );
}
