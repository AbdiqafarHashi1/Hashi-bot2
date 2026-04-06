"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import type { ControlRoomStatePayload } from "../../lib/control-room/contracts";

type SignalTier = "A+" | "A" | "B";
type OutcomeStatus = "OPEN" | "TP1_HIT" | "TP2_HIT" | "STOP_HIT" | "EXPIRED" | "PARTIAL_WIN" | "BE_AFTER_TP1";

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
    persistedTotals: {
      totalOpenSignals: number;
      totalClosedSignals: number;
      totalResolvedSignals: number;
      totalTelegramDispatchRecords: number;
      totalPersistedSignals: number;
    };
  };
};

type PersonalRoomPayload = {
  connectorStatus: { status: string; authPresent: boolean; lastSyncAt: string | null } | null;
  latestAccountSnapshot: { capturedAt: string } | null;
  openPositions: Array<unknown>;
  recentEvents: Array<unknown>;
};

type PropRoomPayload = {
  connectorStatus: { status: string; authPresent: boolean; lastSyncAt: string | null } | null;
  latestAccountSnapshot: { capturedAt: string } | null;
  openPositions: Array<unknown>;
  complianceEvents: Array<unknown>;
};

type SignalTierMetrics = {
  total: number;
  resolved: number;
  wins: number;
  losses: number;
  partialWins: number;
  breakevens: number;
  expired: number;
  winRate: number;
  avgR: number;
  expectancy: number;
};

type SignalPerformancePayload = {
  summary: {
    avgR: number;
    totalSignalsToday: number;
  };
  perTier: Partial<Record<SignalTier, SignalTierMetrics>>;
  filters: {
    minTier: SignalTier;
    minTp2R: number;
    maxEntryStretchAtr: number;
    symbolCooldownMinutes: number;
    bTierEnabled: boolean;
    partialAtTp1Enabled: boolean;
    partialPct: number;
    tp1ProtectMode: "break_even" | "offset_r";
    tp1ProtectOffsetR: number;
    breakevenBufferR: number;
  };
};

type DashboardPayload = {
  signalRoom: SignalRoomPayload | null;
  personalRoom: PersonalRoomPayload | null;
  propRoom: PropRoomPayload | null;
  controlRoom: ControlRoomStatePayload | null;
  runtimeEvents: Array<{ id: string }>;
  incidents: Array<{ id: string; resolved: boolean }>;
  signalPerformance: SignalPerformancePayload | null;
  signalIntegrity: {
    totalSignals: number;
    distributionSum: number;
    mismatch: boolean;
    breakdown: Record<OutcomeStatus, number>;
  } | null;
};

type SystemControlPayload = {
  id: string;
  isRunning: boolean;
  activeMode: "signal" | "personal" | "prop";
  killSwitchActive: boolean;
  allowedSymbols: string[];
  updatedAt: string;
};

const EMPTY_TIER_METRICS: SignalTierMetrics = {
  total: 0,
  resolved: 0,
  wins: 0,
  losses: 0,
  partialWins: 0,
  breakevens: 0,
  expired: 0,
  winRate: 0,
  avgR: 0,
  expectancy: 0
};

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded border border-slate-800 bg-slate-900/70 p-4">
      <h2 className="mb-3 text-lg font-semibold text-slate-100">{title}</h2>
      {children}
    </section>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-100">{value}</p>
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardPayload>({
    signalRoom: null,
    personalRoom: null,
    propRoom: null,
    controlRoom: null,
    runtimeEvents: [],
    incidents: [],
    signalPerformance: null,
    signalIntegrity: null
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [control, setControl] = useState<SystemControlPayload | null>(null);
  const [controlSymbolsInput, setControlSymbolsInput] = useState("");
  const [controlSaving, setControlSaving] = useState(false);
  const [controlError, setControlError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = () => Promise.all([
      fetch("/api/signal-room").then((res) => (res.ok ? (res.json() as Promise<SignalRoomPayload>) : null)),
      fetch("/api/personal-room").then((res) => (res.ok ? (res.json() as Promise<PersonalRoomPayload>) : null)),
      fetch("/api/prop-room").then((res) => (res.ok ? (res.json() as Promise<PropRoomPayload>) : null)),
      fetch("/api/control-room/state").then((res) => (res.ok ? (res.json() as Promise<ControlRoomStatePayload>) : null)),
      fetch("/api/runtime-events").then((res) => (res.ok ? (res.json() as Promise<{ events: Array<{ id: string }> }>) : null)),
      fetch("/api/incidents").then((res) => (res.ok ? (res.json() as Promise<{ incidents: Array<{ id: string; resolved: boolean }> }>) : null)),
      fetch("/api/signal-performance").then((res) => (res.ok ? (res.json() as Promise<SignalPerformancePayload>) : null)),
      fetch("/api/signal-integrity-check").then((res) => (res.ok ? (res.json() as Promise<DashboardPayload["signalIntegrity"]>) : null)),
      fetch("/api/system-control").then((res) => (res.ok ? (res.json() as Promise<{ control: SystemControlPayload }>) : null))
    ])
      .then(([signalRoom, personalRoom, propRoom, controlRoom, runtimeRes, incidentsRes, performanceRes, integrityRes, controlRes]) => {
        if (!mounted) return;
        setData({
          signalRoom,
          personalRoom,
          propRoom,
          controlRoom,
          runtimeEvents: runtimeRes?.events ?? [],
          incidents: incidentsRes?.incidents ?? [],
          signalPerformance: performanceRes,
          signalIntegrity: integrityRes ?? null
        });
        setControl(controlRes?.control ?? null);
        setControlSymbolsInput((controlRes?.control?.allowedSymbols ?? []).join(", "));
        setError(null);
      })
      .catch((err: unknown) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Unable to load dashboard summaries");
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    void load();
    const timer = setInterval(() => {
      void load();
    }, 7000);

    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  const latestSignalAt = useMemo(() => data.signalRoom?.summary.latestSignalTimestamp ?? null, [data.signalRoom]);

  async function persistSystemControl(patch: Partial<Pick<SystemControlPayload, "isRunning" | "activeMode" | "killSwitchActive" | "allowedSymbols">>) {
    setControlSaving(true);
    setControlError(null);
    try {
      const response = await fetch("/api/system-control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch)
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message ?? "System control update failed");
      }
      const payload = (await response.json()) as { control: SystemControlPayload };
      setControl(payload.control);
      setControlSymbolsInput(payload.control.allowedSymbols.join(", "));
    } catch (err: unknown) {
      setControlError(err instanceof Error ? err.message : "System control update failed");
    } finally {
      setControlSaving(false);
    }
  }

  const parsedSymbols = controlSymbolsInput
    .split(",")
    .map((entry) => entry.trim().toUpperCase())
    .filter(Boolean);

  const signalPerformance = data.signalPerformance;
  const aPlusMetrics = signalPerformance?.perTier["A+"] ?? EMPTY_TIER_METRICS;
  const aMetrics = signalPerformance?.perTier.A ?? EMPTY_TIER_METRICS;
  const bMetrics = signalPerformance?.perTier.B ?? EMPTY_TIER_METRICS;

  return (
    <section className="space-y-5">
      <header>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-400">Mode-separated operational summary from persisted Signal, Personal, and Prop rooms.</p>
      </header>

      {loading && <p className="rounded border border-slate-800 bg-slate-900/70 p-3 text-sm text-slate-300">Loading dashboard…</p>}
      {error && <p className="rounded border border-rose-700/50 bg-rose-900/20 p-3 text-sm text-rose-200">{error}</p>}
      {data.signalIntegrity?.mismatch && (
        <p className="rounded border border-amber-700/50 bg-amber-900/20 p-3 text-sm text-amber-100">
          Signal accounting mismatch — metrics not reliable
        </p>
      )}

      {!loading && !error && (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card title="Signal Mode Summary">
            {data.signalRoom ? (
              <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-2">
                <Kpi label="Open trades (DB total)" value={String(data.signalRoom.reconciliation.persistedTotals.totalOpenSignals)} />
                <Kpi label="Closed trades (DB total)" value={String(data.signalRoom.reconciliation.persistedTotals.totalClosedSignals)} />
                <Kpi label="Wins" value={String(data.signalRoom.summary.winCount)} />
                <Kpi label="Losses" value={String(data.signalRoom.summary.lossCount)} />
                <Kpi label="Partial wins" value={String(data.signalRoom.summary.partialWinCount)} />
                <Kpi label="Latest signal" value={latestSignalAt ? new Date(latestSignalAt).toISOString() : "No signals yet"} />
              </div>
            ) : (
              <p className="text-sm text-slate-400">Signal room data unavailable.</p>
            )}
          </Card>

          <Card title="Personal Mode Summary">
            {data.personalRoom ? (
              <div className="grid gap-3 md:grid-cols-2">
                <Kpi label="Connector status" value={data.personalRoom.connectorStatus?.status ?? "No status yet"} />
                <Kpi label="Auth present" value={data.personalRoom.connectorStatus ? (data.personalRoom.connectorStatus.authPresent ? "yes" : "no") : "unknown"} />
                <Kpi
                  label="Latest snapshot"
                  value={data.personalRoom.latestAccountSnapshot ? new Date(data.personalRoom.latestAccountSnapshot.capturedAt).toISOString() : "No snapshot yet"}
                />
                <Kpi label="Open positions" value={String(data.personalRoom.openPositions.length)} />
                <Kpi label="Recent events" value={String(data.personalRoom.recentEvents.length)} />
              </div>
            ) : (
              <p className="text-sm text-slate-400">Personal room data unavailable.</p>
            )}
          </Card>

          <Card title="Prop Mode Summary">
            {data.propRoom ? (
              <div className="grid gap-3 md:grid-cols-2">
                <Kpi label="Connector status" value={data.propRoom.connectorStatus?.status ?? "No status yet"} />
                <Kpi label="Auth present" value={data.propRoom.connectorStatus ? (data.propRoom.connectorStatus.authPresent ? "yes" : "no") : "unknown"} />
                <Kpi
                  label="Latest snapshot"
                  value={data.propRoom.latestAccountSnapshot ? new Date(data.propRoom.latestAccountSnapshot.capturedAt).toISOString() : "No snapshot yet"}
                />
                <Kpi label="Open positions" value={String(data.propRoom.openPositions.length)} />
                <Kpi label="Recent compliance" value={String(data.propRoom.complianceEvents.length)} />
              </div>
            ) : (
              <p className="text-sm text-slate-400">Prop room data unavailable.</p>
            )}
          </Card>

          <Card title="Runtime & Governance Summary">
            {data.controlRoom ? (
              <div className="space-y-2 text-sm text-slate-200">
                <p>Execution mode: <span className="font-medium">{data.controlRoom.mode.executionMode}</span></p>
                <p>Selected strategy: <span className="font-medium">{data.controlRoom.strategies.selectedActiveStrategy}</span></p>
                <p>Active strategy IDs: <span className="font-medium">{data.controlRoom.strategies.activeProductionStrategyIds.join(", ")}</span></p>
                <p>Daily loss lock: <span className="font-medium">{String(data.controlRoom.governance.locks.dailyLoss)}</span></p>
                <p>Trailing drawdown lock: <span className="font-medium">{String(data.controlRoom.governance.locks.trailingDrawdown)}</span></p>
                <p>Max consecutive loss lock: <span className="font-medium">{String(data.controlRoom.governance.locks.maxConsecutiveLoss)}</span></p>
                <p>Telegram signal output enabled: <span className="font-medium">{String(data.controlRoom.telegram.signalOutputEnabled)}</span></p>
                <p>Recent runtime events (latest 100): <span className="font-medium">{data.runtimeEvents.length}</span></p>
                <p>Recent incidents (latest 100): <span className="font-medium">{data.incidents.length}</span></p>
                <p>Unresolved incidents: <span className="font-medium">{data.incidents.filter((incident) => !incident.resolved).length}</span></p>
              </div>
            ) : (
              <p className="text-sm text-slate-400">Runtime/governance metadata unavailable.</p>
            )}
          </Card>

          <Card title="Signal Performance">
            {signalPerformance ? (
              <div className="space-y-3 text-sm">
                <div className="grid gap-3 md:grid-cols-2">
                  <Kpi label="A+ win rate" value={`${(aPlusMetrics.winRate * 100).toFixed(1)}%`} />
                  <Kpi label="A win rate" value={`${(aMetrics.winRate * 100).toFixed(1)}%`} />
                  <Kpi label="B win rate" value={`${(bMetrics.winRate * 100).toFixed(1)}%`} />
                  <Kpi label="Avg R" value={signalPerformance.summary.avgR.toFixed(2)} />
                  <Kpi label="Signals today" value={String(signalPerformance.summary.totalSignalsToday)} />
                </div>
                <div className="rounded border border-slate-800 bg-slate-950/40 p-3 text-xs text-slate-300">
                  <p>Filter settings</p>
                  <p>min tier: <span className="font-medium">{signalPerformance.filters.minTier}</span></p>
                  <p>min TP2 R: <span className="font-medium">{signalPerformance.filters.minTp2R}</span></p>
                  <p>max entry stretch (ATR): <span className="font-medium">{signalPerformance.filters.maxEntryStretchAtr}</span></p>
                  <p>symbol cooldown minutes: <span className="font-medium">{signalPerformance.filters.symbolCooldownMinutes}</span></p>
                  <p>partial at TP1 enabled: <span className="font-medium">{String(signalPerformance.filters.partialAtTp1Enabled)}</span></p>
                  <p>partial pct: <span className="font-medium">{signalPerformance.filters.partialPct}</span></p>
                  <p>TP1 protect mode: <span className="font-medium">{signalPerformance.filters.tp1ProtectMode}</span></p>
                  <p>TP1 protect offset R: <span className="font-medium">{signalPerformance.filters.tp1ProtectOffsetR}</span></p>
                  <p>breakeven buffer R: <span className="font-medium">{signalPerformance.filters.breakevenBufferR}</span></p>
                </div>
                {signalPerformance.filters.bTierEnabled && (
                  <p className="rounded border border-amber-700/50 bg-amber-900/20 p-2 text-xs text-amber-100">
                    Warning: B tier is enabled.
                  </p>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-slate-300">
                    <thead className="text-slate-400">
                      <tr>
                        <th className="text-left">Tier</th>
                        <th className="text-left">Total</th>
                        <th className="text-left">Resolved</th>
                        <th className="text-left">Wins</th>
                        <th className="text-left">Losses</th>
                        <th className="text-left">Partial</th>
                        <th className="text-left">BE@TP1</th>
                        <th className="text-left">Expired</th>
                        <th className="text-left">WinRate</th>
                        <th className="text-left">AvgR</th>
                        <th className="text-left">Expectancy</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(["A+", "A", "B"] as const).map((tier) => {
                        const row = signalPerformance.perTier[tier] ?? EMPTY_TIER_METRICS;
                        return (
                          <tr key={tier} className="border-t border-slate-800">
                            <td>{tier}</td>
                            <td>{row.total}</td>
                            <td>{row.resolved}</td>
                            <td>{row.wins}</td>
                            <td>{row.losses}</td>
                            <td>{row.partialWins}</td>
                            <td>{row.breakevens}</td>
                            <td>{row.expired}</td>
                            <td>{(row.winRate * 100).toFixed(1)}%</td>
                            <td>{row.avgR.toFixed(2)}</td>
                            <td>{row.expectancy.toFixed(2)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-400">No signal performance data yet.</p>
            )}
          </Card>

          <Card title="System Control">
            {control ? (
              <div className="space-y-3 text-sm text-slate-200">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    className="rounded border border-slate-700 px-3 py-1 text-xs hover:bg-slate-800 disabled:opacity-50"
                    onClick={() => persistSystemControl({ isRunning: !control.isRunning })}
                    disabled={controlSaving}
                  >
                    {control.isRunning ? "Stop System" : "Start System"}
                  </button>
                  <select
                    className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs"
                    value={control.activeMode}
                    onChange={(event) => {
                      void persistSystemControl({ activeMode: event.target.value as SystemControlPayload["activeMode"] });
                    }}
                    disabled={controlSaving}
                  >
                    <option value="signal">Signal</option>
                    <option value="personal">Personal</option>
                    <option value="prop">Prop</option>
                  </select>
                  <button
                    className="rounded border border-rose-700/60 px-3 py-1 text-xs text-rose-200 hover:bg-rose-900/30 disabled:opacity-50"
                    onClick={() => persistSystemControl({ killSwitchActive: !control.killSwitchActive })}
                    disabled={controlSaving}
                  >
                    {control.killSwitchActive ? "Disable Kill Switch" : "Enable Kill Switch"}
                  </button>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs text-slate-400" htmlFor="allowed-symbols-input">Allowed symbols (comma-separated)</label>
                  <input
                    id="allowed-symbols-input"
                    className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs"
                    value={controlSymbolsInput}
                    onChange={(event) => setControlSymbolsInput(event.target.value)}
                    placeholder="ETHUSDT, BTCUSDT"
                    disabled={controlSaving}
                  />
                  <button
                    className="rounded border border-slate-700 px-3 py-1 text-xs hover:bg-slate-800 disabled:opacity-50"
                    onClick={() => persistSystemControl({ allowedSymbols: parsedSymbols })}
                    disabled={controlSaving || parsedSymbols.length === 0}
                  >
                    Save allowed symbols
                  </button>
                </div>

                <div className="space-y-1 text-xs text-slate-300">
                  <p>isRunning: <span className="font-medium">{String(control.isRunning)}</span></p>
                  <p>activeMode: <span className="font-medium">{control.activeMode}</span></p>
                  <p>killSwitchActive: <span className="font-medium">{String(control.killSwitchActive)}</span></p>
                  <p>allowedSymbols: <span className="font-medium">{control.allowedSymbols.join(", ")}</span></p>
                  <p>updatedAt: <span className="font-medium">{new Date(control.updatedAt).toISOString()}</span></p>
                </div>
                {controlError && <p className="rounded border border-rose-700/50 bg-rose-900/20 p-2 text-xs text-rose-200">{controlError}</p>}
              </div>
            ) : (
              <p className="text-sm text-slate-400">System control unavailable.</p>
            )}
          </Card>
        </div>
      )}
    </section>
  );
}
