"use client";

import { Card, KeyValue, PageState, StatusBadge } from "../../components/control-room-ui";
import { useControlRoomState } from "../../lib/control-room/client";

function readinessTone(ready: boolean) {
  return ready ? "ready" : "warn" as const;
}

export default function DashboardPage() {
  const { data, loading, error } = useControlRoomState();

  return (
    <section className="space-y-5">
      <header>
        <h1 className="text-3xl font-bold">Control Room</h1>
        <p className="mt-1 text-sm text-slate-400">Operational overview sourced from backend control-room state.</p>
      </header>

      <PageState loading={loading} error={error} />

      {data && (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Card title="Execution Mode" right={<StatusBadge tone="neutral" label={data.mode.executionMode} />}>
              <p className="text-sm text-slate-300">
                Entry mode <span className="font-semibold text-slate-100">{data.mode.breakoutEntryMode}</span> · Edge profile{" "}
                <span className="font-semibold text-slate-100">{data.mode.breakoutEdgeProfile ?? "unavailable"}</span>
              </p>
            </Card>

            <Card
              title="Signal Path"
              right={<StatusBadge tone={readinessTone(data.signalMode.enabled)} label={data.signalMode.enabled ? "enabled" : "disabled"} />}
            >
              <p className="text-sm text-slate-300">{data.signalMode.notes}</p>
            </Card>

            <Card
              title="Personal Demo"
              right={
                <StatusBadge
                  tone={readinessTone(data.connectors.personalDemo.enabled && data.connectors.personalDemo.credentials.configured)}
                  label={data.connectors.personalDemo.credentials.configured ? "ready" : "pending config"}
                />
              }
            >
              <p className="text-sm text-slate-300">Missing: {data.connectors.personalDemo.credentials.missing.join(", ") || "none"}</p>
            </Card>

            <Card
              title="Prop Demo"
              right={
                <StatusBadge
                  tone={readinessTone(data.connectors.propDemo.enabled && data.connectors.propDemo.credentials.configured)}
                  label={data.connectors.propDemo.credentials.configured ? "ready" : "pending config"}
                />
              }
            >
              <p className="text-sm text-slate-300">Missing: {data.connectors.propDemo.credentials.missing.join(", ") || "none"}</p>
            </Card>
          </div>

          <div className="grid gap-3 xl:grid-cols-3">
            <Card title="Strategy Context">
              <KeyValue label="Selected strategy" value={data.strategies.selectedActiveStrategy} />
              <KeyValue label="Production strategy IDs" value={data.strategies.activeProductionStrategyIds.join(", ")} />
              <KeyValue
                label="Research mode"
                value={<StatusBadge tone={data.strategies.swingResearchModeEnabled ? "warn" : "neutral"} label={data.strategies.swingResearchModeEnabled ? "enabled" : "disabled"} />}
              />
            </Card>

            <Card title="Symbols">
              <KeyValue label="Default" value={data.symbols.defaultSymbol} />
              <KeyValue label="Crypto" value={data.symbols.crypto.join(", ") || "none"} />
              <KeyValue label="Forex" value={data.symbols.forex.join(", ") || "none"} />
            </Card>

            <Card title="Governance & Status">
              <KeyValue
                label="Global kill switch"
                value={<StatusBadge tone={data.governance.globalKillSwitchEnabled ? "warn" : "ready"} label={data.governance.globalKillSwitchEnabled ? "on" : "off"} />}
              />
              <KeyValue label="Daily loss lock" value={String(data.governance.locks.dailyLoss)} />
              <KeyValue label="Trailing DD lock" value={String(data.governance.locks.trailingDrawdown)} />
              <KeyValue label="Max loss streak lock" value={String(data.governance.locks.maxConsecutiveLoss)} />
            </Card>
          </div>

          <div className="grid gap-3 xl:grid-cols-2">
            <Card title="Latest Backtest Summary" right={<StatusBadge tone={data.artifacts.backtestLatestAvailable ? "ready" : "warn"} label={data.artifacts.backtestLatestAvailable ? "available" : "missing"} />}>
              <pre className="overflow-auto rounded bg-slate-950/70 p-3 text-xs text-slate-300">
                {JSON.stringify(data.artifacts.backtestLatestSummary, null, 2)}
              </pre>
            </Card>

            <Card
              title="Latest Validation/Report"
              right={<StatusBadge tone={data.artifacts.validationReports.length > 0 ? "ready" : "warn"} label={`${data.artifacts.validationReports.length} artifacts`} />}
            >
              <ul className="space-y-2 text-sm text-slate-300">
                {data.artifacts.validationReports.slice(0, 6).map((report) => (
                  <li key={report.file} className="rounded border border-slate-800 bg-slate-950/50 p-2">
                    <p className="font-medium text-slate-200">{report.file}</p>
                    <p className="text-xs text-slate-400">{report.generatedAt ?? "generatedAt unavailable"}</p>
                    <p className="text-xs">{report.summary}</p>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </>
      )}
    </section>
  );
}
