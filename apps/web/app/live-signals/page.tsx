"use client";

import { Card, KeyValue, PageState, StatusBadge } from "../../components/control-room-ui";
import { useControlRoomState } from "../../lib/control-room/client";

export default function Page() {
  const { data, loading, error } = useControlRoomState();

  return (
    <section className="space-y-5">
      <header>
        <h1 className="text-3xl font-bold">Live Signals Runtime</h1>
        <p className="mt-1 text-sm text-slate-400">Truthful runtime stream visibility without simulated live feed behavior.</p>
      </header>

      <PageState loading={loading} error={error} />

      {data && (
        <div className="grid gap-3 xl:grid-cols-2">
          <Card
            title="Signal Mode"
            right={<StatusBadge tone={data.signalMode.enabled ? "ready" : "disabled"} label={data.signalMode.enabled ? "enabled" : "disabled"} />}
          >
            <KeyValue
              label="Latest payload"
              value={<StatusBadge tone={data.signalMode.latestPayloadAvailable ? "ready" : "warn"} label={data.signalMode.latestPayloadAvailable ? "available" : "not persisted"} />}
            />
            <p className="mt-2 text-sm text-slate-300">{data.signalMode.notes}</p>
          </Card>

          <Card title="Allocator Visibility" right={<StatusBadge tone={data.portfolioAllocator.latestDecisionsAvailable ? "ready" : "warn"} label={data.portfolioAllocator.latestDecisionsAvailable ? "available" : "pending persistence"} />}>
            <KeyValue label="Ranked setups" value={String(data.portfolioAllocator.latestRankedSetupsAvailable)} />
            <KeyValue label="Decisions" value={String(data.portfolioAllocator.latestDecisionsAvailable)} />
            <p className="mt-2 text-sm text-slate-300">{data.portfolioAllocator.notes}</p>
          </Card>

          <Card title="Dispatch Plan Visibility" right={<StatusBadge tone={data.dispatchPlans.personalDemoLatestPlanAvailable || data.dispatchPlans.propDemoLatestPlanAvailable ? "ready" : "warn"} label="runtime plans" />}>
            <KeyValue label="Personal demo plan" value={String(data.dispatchPlans.personalDemoLatestPlanAvailable)} />
            <KeyValue label="Prop demo plan" value={String(data.dispatchPlans.propDemoLatestPlanAvailable)} />
            <p className="mt-2 text-sm text-slate-300">{data.dispatchPlans.notes}</p>
          </Card>

          <Card title="Connector Readiness">
            <KeyValue
              label="Personal demo"
              value={<StatusBadge tone={data.connectors.personalDemo.credentials.configured ? "ready" : "warn"} label={data.connectors.personalDemo.credentials.configured ? "ready" : "needs config"} />}
            />
            <KeyValue
              label="Prop demo"
              value={<StatusBadge tone={data.connectors.propDemo.credentials.configured ? "ready" : "warn"} label={data.connectors.propDemo.credentials.configured ? "ready" : "needs config"} />}
            />
            <p className="mt-2 text-sm text-slate-300">No credentials are displayed. Only readiness metadata is shown.</p>
          </Card>
        </div>
      )}
    </section>
  );
}
