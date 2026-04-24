"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import type { ControlRoomStatePayload } from "../../lib/control-room/contracts";
import type { SignalRoomPayload } from "../../lib/signal-room/contracts";

type SignalTier = "A+" | "A" | "B";
type OutcomeStatus = "OPEN" | "TP1_HIT" | "TP2_HIT" | "STOP_HIT" | "EXPIRED" | "PARTIAL_WIN" | "BE_AFTER_TP1";

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
  controlPlane?: {
    allowedSymbolsRuntimeCount?: number;
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

type RuntimeConfigPayload = {
  mode: "signal" | "personal" | "prop";
  dataSource: "live" | "replay";
  replayDatasetPath?: string;
  signalMode: {
    minimumTier: "A" | "A+";
    dailySignalTarget: number;
    symbolCooldownMinutes: number;
    globalCooldownMinutes: number;
    relaxationEnabled: boolean;
  };
  modes: Record<"signal" | "personal" | "prop", {
    symbols: string[];
    riskPerTradePct: number;
    maxOpenRiskPct: number;
    baseLeverage: number;
    maxLeverage: number;
  }>;
  enginePhaseLock: "engine1_only";
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
    <section className="rounded-lg border border-slate-800/90 bg-slate-900/70 p-4 sm:p-5">
      <h2 className="mb-3 text-base font-semibold tracking-tight text-slate-100 sm:text-lg">{title}</h2>
      {children}
    </section>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-950/40 p-3">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 break-words text-lg font-semibold text-slate-100 sm:text-xl">{value}</p>
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
  const [runtimeConfig, setRuntimeConfig] = useState<RuntimeConfigPayload | null>(null);
  const [configExpanded, setConfigExpanded] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [symbolsInput, setSymbolsInput] = useState("");
  const [riskPerTradePct, setRiskPerTradePct] = useState("");
  const [maxOpenRiskPct, setMaxOpenRiskPct] = useState("");
  const [baseLeverage, setBaseLeverage] = useState("");
  const [maxLeverage, setMaxLeverage] = useState("");
  const [replayDatasetPath, setReplayDatasetPath] = useState("data/datasets/ETHUSDT_15m.csv");
  const [signalMinimumTier, setSignalMinimumTier] = useState<"A" | "A+">("A");
  const [dailySignalTarget, setDailySignalTarget] = useState("2");
  const [symbolCooldownMinutes, setSymbolCooldownMinutes] = useState("90");
  const [globalCooldownMinutes, setGlobalCooldownMinutes] = useState("20");

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
      fetch("/api/system-control").then((res) => (res.ok ? (res.json() as Promise<{ control: SystemControlPayload }>) : null)),
      fetch("/api/control/config").then((res) => (res.ok ? (res.json() as Promise<{ config: RuntimeConfigPayload }>) : null))
    ])
      .then(([signalRoom, personalRoom, propRoom, controlRoom, runtimeRes, incidentsRes, performanceRes, integrityRes, controlRes, configRes]) => {
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
        setRuntimeConfig(configRes?.config ?? null);
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

  useEffect(() => {
    if (!runtimeConfig) return;
    const mode = runtimeConfig.mode;
    const modeConfig = runtimeConfig.modes[mode];
    setSymbolsInput(modeConfig.symbols.join(", "));
    setRiskPerTradePct(modeConfig.riskPerTradePct.toString());
    setMaxOpenRiskPct(modeConfig.maxOpenRiskPct.toString());
    setBaseLeverage(modeConfig.baseLeverage.toString());
    setMaxLeverage(modeConfig.maxLeverage.toString());
    setReplayDatasetPath(runtimeConfig.replayDatasetPath ?? "data/datasets/ETHUSDT_15m.csv");
    setSignalMinimumTier(runtimeConfig.signalMode.minimumTier);
    setDailySignalTarget(runtimeConfig.signalMode.dailySignalTarget.toString());
    setSymbolCooldownMinutes(runtimeConfig.signalMode.symbolCooldownMinutes.toString());
    setGlobalCooldownMinutes(runtimeConfig.signalMode.globalCooldownMinutes.toString());
  }, [runtimeConfig?.mode, runtimeConfig]);

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
  const parsedConfigSymbols = symbolsInput.split(",").map((entry) => entry.trim().toUpperCase()).filter(Boolean);

  async function loadControlConfig() {
    const response = await fetch("/api/control/config", { cache: "no-store" });
    if (!response.ok) throw new Error("Unable to load runtime config");
    const payload = (await response.json()) as { config: RuntimeConfigPayload; control?: SystemControlPayload };
    setRuntimeConfig(payload.config);
  }

  async function saveModeConfig() {
    if (!runtimeConfig) return;
    setConfigSaving(true);
    setConfigError(null);
    try {
      const response = await fetch("/api/control/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: runtimeConfig.mode,
          symbolsCsv: symbolsInput,
          riskPerTradePct: Number(riskPerTradePct),
          maxOpenRiskPct: Number(maxOpenRiskPct),
          baseLeverage: Number(baseLeverage),
          maxLeverage: Number(maxLeverage),
          dataSource: runtimeConfig.dataSource,
          replayDatasetPath,
          signalMode: {
            minimumTier: signalMinimumTier,
            dailySignalTarget: Number(dailySignalTarget),
            symbolCooldownMinutes: Number(symbolCooldownMinutes),
            globalCooldownMinutes: Number(globalCooldownMinutes),
            relaxationEnabled: true
          }
        })
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message ?? "config_save_failed");
      }
      await loadControlConfig();
    } catch (err: unknown) {
      setConfigError(err instanceof Error ? err.message : "config_save_failed");
    } finally {
      setConfigSaving(false);
    }
  }

  async function startBot() {
    setControlSaving(true);
    setControlError(null);
    try {
      const response = await fetch("/api/control/start", { method: "POST" });
      if (response.status === 409) {
        setControlError("Bot is already running.");
      } else if (!response.ok) {
        throw new Error("start_failed");
      }
      const status = await fetch("/api/control/status", { cache: "no-store" });
      const payload = (await status.json()) as { control: SystemControlPayload };
      setControl(payload.control);
    } catch (err: unknown) {
      setControlError(err instanceof Error ? err.message : "start_failed");
    } finally {
      setControlSaving(false);
    }
  }

  async function stopBot() {
    setControlSaving(true);
    setControlError(null);
    try {
      const response = await fetch("/api/control/stop", { method: "POST" });
      if (response.status === 409) {
        setControlError("Bot is already stopped.");
      } else if (!response.ok) {
        throw new Error("stop_failed");
      }
      const status = await fetch("/api/control/status", { cache: "no-store" });
      const payload = (await status.json()) as { control: SystemControlPayload };
      setControl(payload.control);
    } catch (err: unknown) {
      setControlError(err instanceof Error ? err.message : "stop_failed");
    } finally {
      setControlSaving(false);
    }
  }

  const signalPerformance = data.signalPerformance;
  const signalsSentToday = signalPerformance?.summary.totalSignalsToday ?? 0;
  const configuredDailyTarget = runtimeConfig?.signalMode.dailySignalTarget ?? 2;
  const remainingSignalAllowance = Math.max(configuredDailyTarget - signalsSentToday, 0);
  const lastSignalIso = data.signalRoom?.summary.latestSignalTimestamp ? new Date(data.signalRoom.summary.latestSignalTimestamp).toISOString() : null;
  const nextEligibleIso = lastSignalIso
    ? new Date(new Date(lastSignalIso).getTime() + ((runtimeConfig?.signalMode.globalCooldownMinutes ?? 20) * 60_000)).toISOString()
    : "now";
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
        <div className="grid gap-4 2xl:grid-cols-2">
          <Card title="Signal Mode Summary">
            {data.signalRoom ? (
              <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-2">
                <Kpi label="Open trades (DB total)" value={String(data.signalRoom.reconciliation.persistedTotals.totalOpenSignals)} />
                <Kpi label="Closed trades (DB total)" value={String(data.signalRoom.reconciliation.persistedTotals.totalClosedSignals)} />
                <Kpi label="Wins" value={String(data.signalRoom.summary.winCount)} />
                <Kpi label="Losses" value={String(data.signalRoom.summary.lossCount)} />
                <Kpi label="Partial wins" value={String(data.signalRoom.summary.partialWinCount)} />
                <Kpi label="Latest signal" value={latestSignalAt ? new Date(latestSignalAt).toISOString() : "No signals yet"} />
                <Kpi label="Allowed symbols active" value={String(data.signalRoom.controlPlane?.allowedSymbolsRuntimeCount ?? control?.allowedSymbols.length ?? 0)} />
                <Kpi label="Selected this cycle" value={String(data.signalRoom.reconciliation.currentCycle.selectedActionableCountThisCycle ?? 0)} />
                <Kpi label="Rejected this cycle" value={String(data.signalRoom.reconciliation.currentCycle.rejectedCountThisCycle ?? 0)} />
                <Kpi label="Telegram dispatched this cycle" value={String(data.signalRoom.reconciliation.currentCycle.telegramSignalsDispatchedThisCycle)} />
                <Kpi
                  label="Threshold model"
                  value={`${data.signalRoom.signalSelectionPolicy.thresholdPolicy.minTier} + score≥${data.signalRoom.signalSelectionPolicy.thresholdPolicy.effectiveMinScore}`}
                />
                <Kpi
                  label="Market mode"
                  value={`crypto:${data.signalRoom.signalSelectionPolicy.marketModePolicy.cryptoEnabled ? "on" : "off"} / forex readiness-only:${data.signalRoom.signalSelectionPolicy.marketModePolicy.forexReadinessOnly ? "on" : "off"}`}
                />
                <Kpi label="Allowed symbols list" value={(control?.allowedSymbols ?? []).join(", ") || "None"} />
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
                <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-700/70 bg-slate-950/40 p-3">
                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-wide text-slate-400">Mode Control Bar</p>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-slate-400" htmlFor="mode-select">Mode</label>
                      <select
                        id="mode-select"
                        className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs"
                        value={runtimeConfig?.mode ?? control.activeMode}
                        onChange={(event) => setRuntimeConfig((prev) => prev ? { ...prev, mode: event.target.value as RuntimeConfigPayload["mode"] } : prev)}
                        disabled={controlSaving || configSaving}
                      >
                        <option value="signal">Signal</option>
                        <option value="personal">Personal</option>
                        <option value="prop">Prop</option>
                      </select>
                      <span className="rounded border border-slate-700 px-2 py-1 text-xs">
                        Active: {control.activeMode}
                      </span>
                      <span className="rounded border border-cyan-700 px-2 py-1 text-xs text-cyan-200">
                        DATA SOURCE: {runtimeConfig?.dataSource ?? "live"}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">MODE: {runtimeConfig?.mode ?? control.activeMode}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded px-2 py-1 text-xs font-semibold ${control.isRunning ? "bg-emerald-800/40 text-emerald-200" : "bg-slate-700/60 text-slate-200"}`}>
                      {control.isRunning ? "RUNNING" : "STOPPED"}
                    </span>
                    <button
                      className="rounded border border-emerald-600/70 bg-emerald-700/20 px-3 py-1 text-xs text-emerald-200 hover:bg-emerald-700/35 disabled:opacity-50"
                      onClick={startBot}
                      disabled={controlSaving || control.isRunning}
                    >
                      START BOT
                    </button>
                    <button
                      className="rounded border border-rose-600/70 bg-rose-700/20 px-3 py-1 text-xs text-rose-200 hover:bg-rose-700/35 disabled:opacity-50"
                      onClick={stopBot}
                      disabled={controlSaving || !control.isRunning}
                    >
                      STOP BOT
                    </button>
                  </div>
                </div>

                <div className="rounded border border-slate-700/70 bg-slate-950/40 p-3">
                  <button
                    className="w-full text-left text-xs font-semibold uppercase tracking-wide text-slate-300"
                    onClick={() => setConfigExpanded((prev) => !prev)}
                    type="button"
                  >
                    Mode Configuration {configExpanded ? "▲" : "▼"}
                  </button>
                  {configExpanded && runtimeConfig && (
                    <div className="mt-3 space-y-2 text-xs">
                      <label className="block text-slate-400">Symbols (comma-separated)</label>
                      <input
                        className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1"
                        value={symbolsInput}
                        onChange={(event) => setSymbolsInput(event.target.value)}
                      />
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div>
                          <label className="block text-slate-400">Risk per trade (%)</label>
                          <input className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1" value={riskPerTradePct} onChange={(event) => setRiskPerTradePct(event.target.value)} />
                        </div>
                        <div>
                          <label className="block text-slate-400">Max open risk (%)</label>
                          <input className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1" value={maxOpenRiskPct} onChange={(event) => setMaxOpenRiskPct(event.target.value)} />
                        </div>
                        <div>
                          <label className="block text-slate-400">Base leverage</label>
                          <input className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1" value={baseLeverage} onChange={(event) => setBaseLeverage(event.target.value)} />
                        </div>
                        <div>
                          <label className="block text-slate-400">Max leverage</label>
                          <input className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1" value={maxLeverage} onChange={(event) => setMaxLeverage(event.target.value)} />
                        </div>
                      </div>
                      <div>
                        <label className="block text-slate-400">Data Source</label>
                        <select
                          className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1"
                          value={runtimeConfig.dataSource}
                          onChange={(event) => setRuntimeConfig((prev) => prev ? { ...prev, dataSource: event.target.value as RuntimeConfigPayload["dataSource"] } : prev)}
                        >
                          <option value="live">Live</option>
                          <option value="replay">Replay</option>
                        </select>
                      </div>
                      {runtimeConfig.dataSource === "replay" && (
                        <div>
                          <label className="block text-slate-400">Dataset Path</label>
                          <input
                            className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1"
                            value={replayDatasetPath}
                            onChange={(event) => setReplayDatasetPath(event.target.value)}
                            placeholder="data/datasets/ETHUSDT_15m.csv"
                          />
                        </div>
                      )}
                      {runtimeConfig.mode === "signal" && (
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div>
                            <label className="block text-slate-400">Signal minimum tier</label>
                            <select className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1" value={signalMinimumTier} onChange={(event) => setSignalMinimumTier(event.target.value as "A" | "A+")}>
                              <option value="A">A</option>
                              <option value="A+">A+</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-slate-400">Daily signal target (1-5)</label>
                            <input className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1" value={dailySignalTarget} onChange={(event) => setDailySignalTarget(event.target.value)} />
                          </div>
                          <div>
                            <label className="block text-slate-400">Per-symbol cooldown (min)</label>
                            <input className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1" value={symbolCooldownMinutes} onChange={(event) => setSymbolCooldownMinutes(event.target.value)} />
                          </div>
                          <div>
                            <label className="block text-slate-400">Global cooldown (min)</label>
                            <input className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1" value={globalCooldownMinutes} onChange={(event) => setGlobalCooldownMinutes(event.target.value)} />
                          </div>
                        </div>
                      )}
                      <button
                        className="rounded border border-slate-700 px-3 py-1 hover:bg-slate-800 disabled:opacity-50"
                        onClick={saveModeConfig}
                        disabled={configSaving || parsedConfigSymbols.length === 0 || Number(maxLeverage) < Number(baseLeverage)}
                      >
                        Save mode configuration
                      </button>
                      {configError && <p className="rounded border border-rose-700/50 bg-rose-900/20 p-2 text-xs text-rose-200">{configError}</p>}
                      <p className="text-slate-400">Engine lock: {runtimeConfig.enginePhaseLock}</p>
                    </div>
                  )}
                </div>

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
                  <p>dataSource: <span className="font-medium">{runtimeConfig?.dataSource ?? "live"}</span></p>
                  <p>killSwitchActive: <span className="font-medium">{String(control.killSwitchActive)}</span></p>
                  <p>allowedSymbols: <span className="font-medium">{control.allowedSymbols.join(", ")}</span></p>
                  <p>updatedAt: <span className="font-medium">{new Date(control.updatedAt).toISOString()}</span></p>
                  <p>signalsSentToday: <span className="font-medium">{signalsSentToday}</span></p>
                  <p>dailySignalTarget: <span className="font-medium">{configuredDailyTarget}</span></p>
                  <p>remainingSignalAllowance: <span className="font-medium">{remainingSignalAllowance}</span></p>
                  <p>lastSignalTime: <span className="font-medium">{lastSignalIso ?? "none"}</span></p>
                  <p>nextEligibleSignalTime: <span className="font-medium">{nextEligibleIso}</span></p>
                  <p>blockedByCooldownThisCycle: <span className="font-medium">{String(data.signalRoom?.reconciliation?.cycleTruth?.candidatesRejectedBy?.cooldown ?? 0)}</span></p>
                  <p>blockedByQualityThisCycle: <span className="font-medium">{String((data.signalRoom?.reconciliation?.cycleTruth?.candidatesRejectedBy?.below_min_tier ?? 0) + (data.signalRoom?.reconciliation?.cycleTruth?.candidatesRejectedBy?.below_min_score ?? 0))}</span></p>
                  <p>latestRejectedReason: <span className="font-medium">{data.signalRoom?.rejectedThisCycle?.[0]?.rejectionReason ?? "none"}</span></p>
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
