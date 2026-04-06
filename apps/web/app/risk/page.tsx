"use client";

import { Card, KeyValue, PageState, StatusBadge } from "../../components/control-room-ui";
import { useControlRoomState } from "../../lib/control-room/client";

export default function Page() {
  const { data, loading, error } = useControlRoomState();

  return (
    <section className="space-y-5">
      <header>
        <h1 className="text-3xl font-bold">Risk & Governance</h1>
        <p className="mt-1 text-sm text-slate-400">Read-only governance/compliance visibility from runtime metadata. No risk controls are mutable from this page yet.</p>
      </header>

      <PageState loading={loading} error={error} />

      {data && (
        <div className="grid gap-3 xl:grid-cols-2">
          <Card title="Allocator Caps" right={<StatusBadge tone="neutral" label={data.mode.executionMode} />}>
            <KeyValue label="Per-symbol cap" value={`${data.allocator.perSymbolRiskCapPct}%`} />
            <KeyValue label="Total open-risk cap" value={data.allocator.totalOpenRiskCapPct === null ? "not persisted" : `${data.allocator.totalOpenRiskCapPct}%`} />
            <p className="mt-2 text-sm text-slate-300">{data.allocator.notes}</p>
          </Card>

          <Card
            title="Governance Locks"
            right={
              <StatusBadge
                tone={data.governance.globalKillSwitchEnabled ? "warn" : "ready"}
                label={data.governance.globalKillSwitchEnabled ? "kill-switch ON" : "kill-switch OFF"}
              />
            }
          >
            <KeyValue
              label="Daily loss lock"
              value={<StatusBadge tone={data.governance.locks.dailyLoss ? "warn" : "ready"} label={data.governance.locks.dailyLoss ? "active" : "inactive"} />}
            />
            <KeyValue
              label="Trailing drawdown lock"
              value={<StatusBadge tone={data.governance.locks.trailingDrawdown ? "warn" : "ready"} label={data.governance.locks.trailingDrawdown ? "active" : "inactive"} />}
            />
            <KeyValue
              label="Max consecutive loss lock"
              value={<StatusBadge tone={data.governance.locks.maxConsecutiveLoss ? "warn" : "ready"} label={data.governance.locks.maxConsecutiveLoss ? "active" : "inactive"} />}
            />
          </Card>

          <Card title="Allocator Output Visibility" right={<StatusBadge tone={data.portfolioAllocator.latestDecisionsAvailable ? "ready" : "warn"} label={data.portfolioAllocator.latestDecisionsAvailable ? "visible" : "pending"} />}>
            <KeyValue label="Ranked setups exposed" value={String(data.portfolioAllocator.latestRankedSetupsAvailable)} />
            <KeyValue label="Decisions exposed" value={String(data.portfolioAllocator.latestDecisionsAvailable)} />
            <p className="mt-2 text-sm text-slate-300">{data.portfolioAllocator.notes}</p>
          </Card>

          <Card title="System Snapshot">
            <KeyValue label="Health" value={data.systemStatus.healthEndpoint.status} />
            <KeyValue label="Incidents snapshot" value={data.systemStatus.incidentsAvailable ? "available" : "not persisted"} />
            <KeyValue label="Logs snapshot" value={data.systemStatus.logsAvailable ? "available" : "not persisted"} />
            <p className="mt-2 text-sm text-slate-300">{data.systemStatus.notes}</p>
          </Card>
        </div>
      )}
    </section>
  );
}
